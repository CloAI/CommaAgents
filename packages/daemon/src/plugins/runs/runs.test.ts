import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { registerModel } from "../../../../core/src/model/model";
import { createRunsPlugin } from "./runs";

import {
  cleanupRunFixtures,
  createMockRunsPlugin,
  directories,
  fakeLoader,
  repository,
} from "./test.utils";

afterEach(cleanupRunFixtures);

describe("runs plugin", () => {
  test("persists real agent records before completion and restores them on continuation", async () => {
    registerModel("mock/model", {
      modelId: "mock/model",
      specificationVersion: "v3",
      provider: "mock",
      defaultObjectGenerationMode: undefined,
      doGenerate: async () => ({
        content: [{ type: "text" as const, text: "model answer" }],
        finishReason: { unified: "stop" as const, raw: undefined },
        usage: {
          inputTokens: {
            total: 1,
            noCache: undefined,
            cacheRead: undefined,
            cacheWrite: undefined,
          },
          outputTokens: {
            total: 2,
            text: undefined,
            reasoning: undefined,
          },
        },
        warnings: [],
      }),
      doStream: async () => ({
        stream: new ReadableStream({
          start(controller) {
            controller.close();
          },
        }),
      }),
    } as unknown as Parameters<typeof registerModel>[1]);
    const directory = mkdtempSync(join(tmpdir(), "runs-plugin-model-"));
    directories.push(directory);
    const strategyPath = join(directory, "strategy.json");
    writeFileSync(
      strategyPath,
      JSON.stringify({
        name: "Model Flow",
        version: "1.0",
        agents: { assistant: { model: "mock/model" } },
        flow: {
          name: "Main",
          type: "sequential",
          steps: [{ agent: "assistant" }],
        },
      }),
    );
    const runs = createRunsPlugin({ runsDir: join(directory, "runs") });
    await runs.prepareRun({ runId: "model-1", strategyPath });
    expect((await runs.startRun("model-1", "first").completion).status).toBe(
      "completed",
    );
    expect(
      (await runs.getHistory("model-1")).filter(
        (event) => event.type === "agent_call",
      ),
    ).toHaveLength(1);
    const prepared = await runs.prepareRun({ runId: "model-1" });
    expect(prepared.phase).toBe("prepared");
    expect(
      (await runs.continueRun("model-1", "second").completion).status,
    ).toBe("completed");
    expect(
      (await runs.getHistory("model-1")).filter(
        (event) => event.type === "agent_call",
      ),
    ).toHaveLength(2);
  });

  test("loads and executes a real strategy without the server", async () => {
    const directory = mkdtempSync(join(tmpdir(), "runs-plugin-real-"));
    directories.push(directory);
    const strategyPath = join(directory, "strategy.json");
    writeFileSync(
      strategyPath,
      JSON.stringify({
        name: "User Flow",
        version: "1.0",
        agents: {
          user: {
            type: "user",
            config: { requireInput: false },
          },
        },
        flow: {
          name: "Main",
          type: "sequential",
          steps: [{ agent: "user" }],
        },
      }),
    );
    const runs = createRunsPlugin({ runsDir: join(directory, "runs") });
    const prepared = await runs.prepareRun({ strategyPath, runId: "real-1" });
    expect(prepared.phase).toBe("prepared");
    const outcome = await runs.startRun("real-1", "hello").completion;
    expect(outcome.status).toBe("completed");
    if (outcome.status === "completed")
      expect(outcome.result.text).toBe("hello");
  });

  test("prepares, executes durably, and continues with restored history", async () => {
    const storage = repository();
    const observed = { loads: [] as string[], restored: [] as string[][] };
    const runs = createMockRunsPlugin({
      repository: storage,
      loadStrategy: fakeLoader(observed),
    });
    const cleanup: string[] = [];
    runs.registerRunPreparation({
      name: "feature",
      prepare() {
        return {
          dispose: () => {
            cleanup.push("feature");
          },
        };
      },
    });
    runs.registerStrategyHooks({ name: "feature", attach() {} });

    const prepared = await runs.prepareRun({
      runId: "run-1",
      strategyPath: "example.json",
    });
    expect(prepared.phase).toBe("prepared");
    const first = await runs.startRun("run-1", "first").completion;
    expect(first.status).toBe("completed");
    expect(cleanup).toEqual(["feature"]);

    const continued = await runs.prepareRun({ runId: "run-1" });
    expect(continued.phase).toBe("prepared");
    expect(observed.loads).toEqual(["run-1", "run-1"]);
    expect(observed.restored).toHaveLength(1);
    expect(observed.restored[0]).toHaveLength(1);
    const second = await runs.continueRun("run-1", "second").completion;
    expect(second.status).toBe("completed");
    expect(cleanup).toEqual(["feature", "feature"]);

    const events = await storage.getEvents("run-1");
    expect(events.filter((event) => event.type === "run_started")).toHaveLength(
      2,
    );
    expect(
      events.filter((event) => event.type === "run_completed"),
    ).toHaveLength(2);
    expect(events.filter((event) => event.type === "agent_call")).toHaveLength(
      2,
    );
    const completed = events.at(-1);
    expect(completed?.type).toBe("run_completed");
    if (completed?.type === "run_completed") {
      expect(completed.result?.text).toBe("second");
    }
  });
});
