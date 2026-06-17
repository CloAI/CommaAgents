import { afterEach, describe, expect, it } from "bun:test";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  registerModel,
  resetModelRegistry,
  type Strategy,
} from "@comma-agents/core";
import { runIteration } from "./run-harness";

/** Register a text-only mock streaming model under `modelString`. */
function registerMockModel(modelString: string): void {
  registerModel(modelString, {
    modelId: modelString,
    specificationVersion: "v3",
    provider: "mock",
    defaultObjectGenerationMode: undefined,
    doStream: async () => ({
      stream: new ReadableStream({
        start(controller) {
          const textId = "text-0";
          controller.enqueue({ type: "text-start" as const, id: textId });
          controller.enqueue({
            type: "text-delta" as const,
            delta: `response from ${modelString}`,
            id: textId,
          });
          controller.enqueue({ type: "text-end" as const, id: textId });
          controller.enqueue({
            type: "finish" as const,
            finishReason: { unified: "stop" as const, raw: undefined },
            usage: {
              inputTokens: {
                total: 10,
                noCache: undefined,
                cacheRead: undefined,
                cacheWrite: undefined,
              },
              outputTokens: {
                total: 20,
                text: undefined,
                reasoning: undefined,
              },
            },
          });
          controller.close();
        },
      }),
    }),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- mock doesn't need the full interface
  } as any);
}

function textStrategy(): Strategy {
  return {
    name: "Harness Test",
    version: "1.0",
    agents: {
      assistant: { model: "mock/test", systemPrompt: "You are helpful." },
    },
    flow: {
      name: "Main",
      type: "sequential",
      steps: [{ agent: "assistant" }],
    },
  } as Strategy;
}

const tempDirs: string[] = [];

afterEach(async () => {
  resetModelRegistry();
  for (const dir of tempDirs.splice(0)) {
    await rm(dir, { recursive: true, force: true });
  }
});

describe("runIteration", () => {
  it("runs a strategy and captures agent_call + lifecycle events", async () => {
    registerMockModel("mock/test");

    const result = await runIteration({
      strategy: textStrategy(),
      input: "hello",
    });
    tempDirs.push(result.tempDir);

    expect(result.status).toBe("completed");
    expect(result.result.text).toContain("response from mock/test");

    const types = result.events.map((event) => event.type);
    expect(types).toContain("run_started");
    expect(types).toContain("agent_call");
    expect(types).toContain("run_completed");
  });

  it("executes in an isolated temp dir seeded from a fixture, untouched base", async () => {
    registerMockModel("mock/test");

    const seedDir = await mkdtemp(join(tmpdir(), "rlprompter-seed-"));
    tempDirs.push(seedDir);
    await writeFile(join(seedDir, "seed.txt"), "original", "utf-8");

    const result = await runIteration({
      strategy: textStrategy(),
      input: "hello",
      seedDir,
    });
    tempDirs.push(result.tempDir);

    expect(result.tempDir).not.toBe(seedDir);
    expect(result.tempDir).not.toBe(process.cwd());
    // The seed file was copied into the isolated workdir.
    const copied = await readFile(join(result.tempDir, "seed.txt"), "utf-8");
    expect(copied).toBe("original");
    // The original fixture is untouched.
    const original = await readFile(join(seedDir, "seed.txt"), "utf-8");
    expect(original).toBe("original");
  });

  it("applies overrides without mutating the input strategy", async () => {
    registerMockModel("mock/test");
    const strategy = textStrategy();

    const result = await runIteration({
      strategy,
      input: "hello",
      overrides: [{ agentName: "assistant", systemPrompt: "Overridden." }],
    });
    tempDirs.push(result.tempDir);

    expect(result.status).toBe("completed");
    const assistant = strategy.agents.assistant;
    if (!assistant || "type" in assistant) throw new Error("llm");
    expect(assistant.systemPrompt).toBe("You are helpful.");
  });
});
