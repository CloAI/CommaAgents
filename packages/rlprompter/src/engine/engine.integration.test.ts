// End-to-end engine pipeline: run two iterations through the harness, persist
// them in an experiment store, reload their timelines, and compare. Uses a mock
// model so it is deterministic and requires no provider credentials.

import { afterEach, describe, expect, it } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  registerModel,
  resetModelRegistry,
  type Strategy,
} from "@comma-agents/core";
import { compareIterations } from "./compare";
import { createExperimentStore } from "./experiment";
import { runIteration } from "./run-harness";

function registerMockModel(modelString: string, reply: string): void {
  registerModel(modelString, {
    modelId: modelString,
    specificationVersion: "v3",
    provider: "mock",
    defaultObjectGenerationMode: undefined,
    doStream: async () => ({
      stream: new ReadableStream({
        start(controller) {
          const id = "text-0";
          controller.enqueue({ type: "text-start" as const, id });
          controller.enqueue({ type: "text-delta" as const, delta: reply, id });
          controller.enqueue({ type: "text-end" as const, id });
          controller.enqueue({
            type: "finish" as const,
            finishReason: { unified: "stop" as const, raw: undefined },
            usage: {
              inputTokens: {
                total: 5,
                noCache: undefined,
                cacheRead: undefined,
                cacheWrite: undefined,
              },
              outputTokens: { total: 7, text: undefined, reasoning: undefined },
            },
          });
          controller.close();
        },
      }),
    }),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- mock
  } as any);
}

const roots: string[] = [];
afterEach(async () => {
  resetModelRegistry();
  for (const dir of roots.splice(0)) {
    await rm(dir, { recursive: true, force: true });
  }
});

function strategy(): Strategy {
  return {
    name: "Pipeline",
    version: "1.0",
    agents: { assistant: { model: "mock/test", systemPrompt: "Base prompt." } },
    flow: { name: "Main", type: "sequential", steps: [{ agent: "assistant" }] },
  } as Strategy;
}

describe("engine pipeline", () => {
  it("runs, persists, reloads, and compares two iterations", async () => {
    registerMockModel("mock/test", "the answer");

    const root = await mkdtemp(join(tmpdir(), "rlprompter-e2e-"));
    roots.push(root);
    const store = createExperimentStore({ rootDir: root });

    const experiment = await store.create({
      name: "E2E",
      strategyPath: "/virtual/strategy.json",
    });

    // Iteration 1 — base prompt.
    const run1 = await runIteration({ strategy: strategy(), input: "go" });
    roots.push(run1.tempDir);
    const it1 = await store.appendIteration(experiment.id, {
      input: "go",
      overrides: [],
      result: run1,
    });

    // Iteration 2 — with a queued override layered on.
    const run2 = await runIteration({
      strategy: strategy(),
      input: "go",
      overrides: [
        { agentName: "assistant", appendToSystemPrompt: "Be concise." },
      ],
    });
    roots.push(run2.tempDir);
    const it2 = await store.appendIteration(experiment.id, {
      input: "go",
      overrides: [
        { agentName: "assistant", appendToSystemPrompt: "Be concise." },
      ],
      result: run2,
    });

    expect(it1.index).toBe(1);
    expect(it2.index).toBe(2);
    expect(it2.overrides).toHaveLength(1);

    // Reload persisted timelines and compare.
    const events1 = await store.getIterationEvents(experiment.id, it1.id);
    const events2 = await store.getIterationEvents(experiment.id, it2.id);
    expect(events1.some((e) => e.type === "agent_call")).toBe(true);

    const comparison = compareIterations(
      { label: "#1", events: events1 },
      { label: "#2", events: events2 },
    );
    // Identical mock output → no text or file differences.
    expect(comparison.textDiff).toBe("");
    expect(comparison.files).toHaveLength(0);
  });
});
