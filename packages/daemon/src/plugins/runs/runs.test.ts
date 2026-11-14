import { RunPhase, RunOutcomeStatus } from "./state/state.schemas";
import { afterEach, describe, expect, test } from "vitest";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { registerModel } from "../../../../core/src/model/model";
import { createRunsPlugin } from "./runs";

import { cleanupRunFixtures, directories } from "./test.utils";

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
            controller.enqueue({ type: "stream-start", warnings: [] });
            controller.enqueue({ type: "text-start", id: "text" });
            controller.enqueue({
              type: "text-delta",
              id: "text",
              delta: "model answer",
            });
            controller.enqueue({ type: "text-end", id: "text" });
            controller.enqueue({
              type: "finish",
              finishReason: { unified: "stop", raw: undefined },
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
            });
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
    await runs.prepareRun({
      runId: "model-1",
      configuration: {
        strategyPath,
      },
    });
    expect((await runs.startRun("model-1", "first").completion).status).toBe(
      RunOutcomeStatus.completed,
    );
    expect(
      (await runs.getHistory("model-1")).entries.filter(
        (event) => event.type === "message" && event.role === "agent",
      ),
    ).toHaveLength(1);
    const prepared = await runs.prepareRun({ runId: "model-1" });
    expect(prepared.phase).toBe(RunPhase.prepared);
    expect((await runs.startRun("model-1", "second").completion).status).toBe(
      RunOutcomeStatus.completed,
    );
    expect(
      (await runs.getHistory("model-1")).entries.filter(
        (event) => event.type === "message" && event.role === "agent",
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
    const prepared = await runs.prepareRun({
      runId: "real-1",
      configuration: {
        strategyPath,
      },
    });
    expect(prepared.phase).toBe(RunPhase.prepared);
    const outcome = await runs.startRun("real-1", "hello").completion;
    expect(outcome.status).toBe(RunOutcomeStatus.completed);
    if (outcome.status === "completed") {
      expect(outcome.result.text).toBe("hello");
    }
  });
});
