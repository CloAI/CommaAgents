import { afterEach, describe, expect, it } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { TimelineEvent } from "@comma-agents/core";
import type { RunIterationResult } from "../run-harness";
import { createExperimentStore } from "./experiment-store";

const roots: string[] = [];

afterEach(async () => {
  for (const dir of roots.splice(0)) {
    await rm(dir, { recursive: true, force: true });
  }
});

async function makeStore() {
  const root = await mkdtemp(join(tmpdir(), "rlprompter-store-"));
  roots.push(root);
  return createExperimentStore({ rootDir: root });
}

function fakeResult(text: string, mutations: number): RunIterationResult {
  const events: TimelineEvent[] = [
    {
      type: "run_started",
      ts: "2026-01-01T00:00:00.000Z",
      strategyPath: "/s.json",
      strategyName: "S",
      cwd: "/tmp/x",
    },
  ];
  for (let i = 0; i < mutations; i++) {
    events.push({
      type: "tool_mutation",
      ts: "2026-01-01T00:00:01.000Z",
      agentName: "a",
      toolName: "write_file",
      operation: "create",
      path: `f${i}.txt`,
      success: true,
    });
  }
  events.push({
    type: "run_completed",
    ts: "2026-01-01T00:00:02.000Z",
    status: "completed",
  });
  return {
    events,
    tempDir: "/tmp/x",
    status: "completed",
    result: {
      text,
      usage: { promptTokens: 11, completionTokens: 22 },
      finishReason: "stop",
      responseMessages: [],
      steps: [],
    },
  };
}

describe("createExperimentStore", () => {
  it("creates, loads, and lists experiments", async () => {
    const store = await makeStore();
    const created = await store.create({
      name: "Tune assistant",
      strategyPath: "/s.json",
      seedDir: "/seed",
    });

    const loaded = await store.load(created.id);
    expect(loaded.name).toBe("Tune assistant");
    expect(loaded.iterations).toHaveLength(0);

    const list = await store.list();
    expect(list).toHaveLength(1);
    expect(list[0]?.id).toBe(created.id);
  });

  it("appends iterations and round-trips their timeline", async () => {
    const store = await makeStore();
    const exp = await store.create({ name: "E", strategyPath: "/s.json" });

    const iteration = await store.appendIteration(exp.id, {
      input: "hello",
      overrides: [{ agentName: "assistant", systemPrompt: "x" }],
      result: fakeResult("answer", 2),
    });

    expect(iteration.index).toBe(1);
    expect(iteration.summary.text).toBe("answer");
    expect(iteration.summary.mutationCount).toBe(2);
    expect(iteration.summary.promptTokens).toBe(11);

    const reloaded = await store.load(exp.id);
    expect(reloaded.iterations).toHaveLength(1);

    const events = await store.getIterationEvents(exp.id, iteration.id);
    expect(events.filter((e) => e.type === "tool_mutation")).toHaveLength(2);
    expect(events.at(0)?.type).toBe("run_started");
  });

  it("increments iteration index across appends", async () => {
    const store = await makeStore();
    const exp = await store.create({ name: "E", strategyPath: "/s.json" });
    await store.appendIteration(exp.id, {
      input: "a",
      overrides: [],
      result: fakeResult("1", 0),
    });
    const second = await store.appendIteration(exp.id, {
      input: "b",
      overrides: [],
      result: fakeResult("2", 0),
    });
    expect(second.index).toBe(2);
  });

  it("sets iteration feedback", async () => {
    const store = await makeStore();
    const exp = await store.create({ name: "E", strategyPath: "/s.json" });
    const iteration = await store.appendIteration(exp.id, {
      input: "a",
      overrides: [],
      result: fakeResult("1", 0),
    });

    const updated = await store.setIterationFeedback(exp.id, iteration.id, {
      notes: "Too verbose",
      score: 3,
    });
    expect(updated.feedback?.notes).toBe("Too verbose");

    const reloaded = await store.load(exp.id);
    expect(reloaded.iterations[0]?.feedback?.score).toBe(3);
  });

  it("deletes experiments", async () => {
    const store = await makeStore();
    const exp = await store.create({ name: "E", strategyPath: "/s.json" });
    expect(await store.delete(exp.id)).toBe(true);
    expect(await store.delete(exp.id)).toBe(false);
    expect(await store.list()).toHaveLength(0);
  });
});
