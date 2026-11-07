import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import { join } from "node:path";
import { performance } from "node:perf_hooks";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";

const root = process.argv[2];
const mode = process.argv[3] ?? "server";
const core = await import(
  pathToFileURL(join(root, "packages/core/dist/index.js")).href
);
const daemon = await import(
  pathToFileURL(join(root, "packages/daemon/dist/index.js")).href
);
const require = createRequire(join(root, "packages/daemon/package.json"));
const { z } = require("zod/v4");
if (mode === "lifecycle") {
  const text = "deterministic model answer";
  const finishReason = { unified: "stop", raw: undefined };
  const usage = { inputTokens: { total: 1 }, outputTokens: { total: 3 } };
  core.registerModel("benchmark/model", {
    modelId: "model",
    provider: "benchmark",
    specificationVersion: "v3",
    supportedUrls: {},
    async doGenerate() {
      return {
        content: [{ type: "text", text }],
        finishReason,
        usage,
        warnings: [],
      };
    },
    async doStream() {
      return {
        stream: new ReadableStream({
          start(controller) {
            for (const part of [
              { type: "stream-start", warnings: [] },
              { type: "text-start", id: "text" },
              ...text.split(" ").map((word) => ({
                type: "text-delta",
                id: "text",
                delta: `${word} `,
              })),
              { type: "text-end", id: "text" },
              { type: "finish", finishReason, usage },
            ])
              controller.enqueue(part);
            controller.close();
          },
        }),
      };
    },
  });
  const probe = core.createAgent({ name: "probe", model: "benchmark/model" });
  await probe.call("probe");
  const directory = await mkdtemp(join(tmpdir(), "comma-runtime-benchmark-"));
  let kernel;
  try {
    const strategyPath = join(directory, "strategy.json");
    await writeFile(
      strategyPath,
      JSON.stringify({
        name: "Benchmark",
        version: "1.0",
        agents: { assistant: { model: "benchmark/model" } },
        flow: {
          name: "Main",
          type: "sequential",
          steps: [{ agent: "assistant" }],
        },
      }),
    );
    kernel = await daemon.createDaemonKernel({
      runs: { runsDir: join(directory, "runs") },
    });
    const cpu = process.cpuUsage();
    const started = performance.now();
    const durations = [];
    const iterations = 20;
    for (let index = 0; index < iterations; index++) {
      const runId = `benchmark-${index}`;
      const start = performance.now();
      await kernel.plugins.runs.prepareRun({
        runId,
        configuration: { strategyPath, cwd: directory },
      });
      const outcome = await kernel.plugins.runs.startRun(runId, "fixture")
        .completion;
      if (outcome.status !== "completed")
        throw new Error(`Run failed: ${JSON.stringify(outcome)}`);
      const history = await kernel.plugins.runs.getHistory(runId);
      if (
        !history.entries.some(
          (event) => event.type === "message" && event.role === "agent",
        )
      )
        throw new Error("Missing persisted agent history");
      durations.push(performance.now() - start);
    }
    console.log(
      JSON.stringify({
        iterations,
        durationMs: performance.now() - started,
        durationsMs: durations,
        cpu: process.cpuUsage(cpu),
        memory: process.memoryUsage(),
        maxRss: process.resourceUsage().maxRSS,
      }),
    );
  } catch (error) {
    console.log(JSON.stringify({ benchmarkFailure: error.message }));
  } finally {
    await kernel?.dispose();
    core.resetModelRegistry();
    await rm(directory, { recursive: true, force: true });
  }
} else if (mode === "execution") {
  const agent = core.createAgent({
    name: "deterministic",
    execute: async (input) => `Echo: ${input}`,
  });
  const template = core.createPromptTemplate({ template: "Task: {{ input }}" });
  const iterations = Number(process.argv[4] ?? 2000);
  for (let index = 0; index < 100; index++) await agent.call(`warmup-${index}`);
  const cpu = process.cpuUsage();
  const started = performance.now();
  for (let index = 0; index < iterations; index++) {
    const input = `fixture-${index}`;
    const prompt = await template.render({ input });
    const result = await agent.call(prompt);
    if (result.text !== `Echo: Task: ${input}`)
      throw new Error("Execution result mismatch");
  }
  console.log(
    JSON.stringify({
      iterations,
      durationMs: performance.now() - started,
      cpu: process.cpuUsage(cpu),
      memory: process.memoryUsage(),
      maxRss: process.resourceUsage().maxRSS,
    }),
  );
} else {
  const listeners = new Set();
  const message = z
    .object({
      type: z.literal("bench.delta"),
      data: z.object({ sequence: z.number(), payload: z.string() }),
    })
    .strict();
  const plugin = daemon.createPlugin({
    name: "benchmark",
    async cleanup() {},
    server: {
      commands: [
        daemon.defineCommand({
          name: "bench.echo",
          arguments: z.object({ payload: z.string() }),
          output: z.string(),
          handle({ arguments: arguments_ }) {
            return arguments_.payload;
          },
        }),
        daemon.defineCommand({
          name: "bench.publish",
          arguments: z.object({
            count: z.number().int().min(1).max(10000),
            size: z.number().int().min(0).max(1048576),
          }),
          output: z.number(),
          handle({ arguments: { count, size } }) {
            const payload = "x".repeat(size);
            for (let sequence = 0; sequence < count; sequence++)
              for (const listener of listeners)
                listener({ type: "bench.delta", data: { sequence, payload } });
            return count;
          },
        }),
        daemon.defineCommand({
          name: "bench.metrics",
          arguments: z.object({}),
          output: z.any(),
          handle() {
            return {
              memory: process.memoryUsage(),
              cpu: process.cpuUsage(),
              subscribers: listeners.size,
              maxRss: process.resourceUsage().maxRSS,
            };
          },
        }),
      ],
      channels: [
        daemon.defineChannel({
          name: "bench.watch",
          arguments: z.object({}),
          message,
          open({ channel }) {
            const listener = (event) => channel.send(event);
            listeners.add(listener);
            return {
              cleanup() {
                listeners.delete(listener);
              },
            };
          },
        }),
      ],
    },
  });
  const listener = daemon.createDaemonServer({
    daemon: { plugins: { benchmark: plugin } },
    port: 0,
  });
  await listener.start();
  console.log(
    JSON.stringify({
      url: listener.url,
      runtimeVersion: process.version,
      bunVersion: process.versions.bun,
      memory: process.memoryUsage(),
      cpu: process.cpuUsage(),
    }),
  );
  process.stdin.once("data", async () => {
    const started = performance.now();
    await listener.stop();
    console.log(
      JSON.stringify({
        stopped: true,
        shutdownMs: performance.now() - started,
      }),
    );
    process.stdin.destroy();
  });
  process.stdin.resume();
}
