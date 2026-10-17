import { describe, expect, it, spyOn } from "bun:test";
import { getLogger } from "@logtape/logtape";
import type { AgentCallResult } from "@comma-agents/core";
import { createRunStore } from "./run-store";
import { createRunLifecycleEffect } from "../../../daemon-run-state/run-effects";

const result: AgentCallResult = {
  text: "done",
  usage: { promptTokens: 10, completionTokens: 5 },
  finishReason: "stop",
  responseMessages: [],
  steps: [],
};

function createTestRunStore() {
  return createRunStore({
    id: "run-1",
    strategyPath: "/strategy.json",
    strategyName: "Test",
    cwd: "/workspace",
  });
}

describe("createRunStore", () => {
  it("should log lifecycle transitions through its run logging effect", async () => {
    const logger = getLogger(["comma", "daemon", "run-effects"]);
    const debug = spyOn(logger, "debug").mockReturnValue(undefined);
    try {
      const runStore = createTestRunStore();
      runStore.subscribeToTransitions(createRunLifecycleEffect());
      await runStore.transition({ type: "running" });
      await runStore.transition({ type: "completed", result });
      expect(debug).toHaveBeenCalledTimes(2);
      expect(debug).toHaveBeenCalledWith("Daemon run.running", {
        runId: "run-1",
      });
      expect(debug).toHaveBeenCalledWith("Daemon run.completed", {
        runId: "run-1",
      });
    } finally {
      debug.mockRestore();
    }
  });

  it("should transition through valid discriminated lifecycle states", async () => {
    const runStore = createTestRunStore();

    await runStore.transition({ type: "running" });
    await runStore.transition({ type: "completed", result });

    expect(runStore.snapshot()).toEqual({
      id: "run-1",
      strategyPath: "/strategy.json",
      strategyName: "Test",
      startedAt: expect.any(Date),
      cwd: "/workspace",
      status: "completed",
      completedAt: expect.any(Date),
      result,
      error: undefined,
    });
  });

  it("should reject invalid transitions before invoking effects", async () => {
    const runStore = createTestRunStore();
    const calls: string[] = [];
    runStore.subscribeToTransitions({
      name: "observer",
      handle(): void {
        calls.push("called");
      },
    });

    await expect(
      runStore.transition({ type: "completed", result }),
    ).rejects.toThrow("Invalid run status transition: pending -> completed");
    expect(calls).toEqual([]);
    expect(runStore.snapshot().status).toBe("pending");
  });

  it("should start effects concurrently and await all of them", async () => {
    const runStore = createTestRunStore();
    const calls: string[] = [];
    let finishFirstEffect: (() => void) | undefined;
    runStore.subscribeToTransitions({
      name: "first",
      async handle(): Promise<void> {
        calls.push("first-started");
        await new Promise<void>((resolve) => {
          finishFirstEffect = resolve;
        });
        calls.push("first-finished");
      },
    });
    runStore.subscribeToTransitions({
      name: "second",
      handle(): void {
        calls.push("second-started");
        finishFirstEffect?.();
      },
    });

    await runStore.transition({ type: "running" });

    expect(calls).toEqual([
      "first-started",
      "second-started",
      "first-finished",
    ]);
  });

  it("should report effect failures without rejecting a committed transition", async () => {
    const runStore = createTestRunStore();
    runStore.subscribeToTransitions({
      name: "failure",
      handle(): void {
        throw new Error("effect failed");
      },
    });

    const transitionResult = await runStore.transition({ type: "running" });

    expect(transitionResult.effectErrors).toEqual([
      { effectName: "failure", error: expect.any(Error) },
    ]);
    expect(runStore.snapshot().status).toBe("running");
  });

  it("should filter transitions and stop an unsubscribed effect", async () => {
    const runStore = createTestRunStore();
    const calls: string[] = [];
    const unsubscribe = runStore.subscribeToTransitions({
      name: "completed-only",
      statuses: ["completed"],
      handle(): void {
        calls.push("completed");
      },
    });

    await runStore.transition({ type: "running" });
    unsubscribe();
    await runStore.transition({ type: "completed", result });

    expect(calls).toEqual([]);
  });

  it("should abort once when cancelled", async () => {
    const runStore = createTestRunStore();
    const abortCalls: string[] = [];
    runStore.abortSignal.addEventListener("abort", () =>
      abortCalls.push("abort"),
    );

    await runStore.transition({
      type: "cancelled",
      error: { code: "CANCELLED", message: "cancelled" },
    });

    expect(runStore.abortSignal.aborted).toBe(true);
    expect(abortCalls).toEqual(["abort"]);
  });

  it("should isolate subscribers and runtime values and clear them on disposal", () => {
    const runStore = createTestRunStore();
    runStore.addSubscriber("client-1");
    runStore.setRuntimeValue("value", { ready: true });

    expect(runStore.getSubscribers()).toEqual(["client-1"]);
    expect(
      runStore.getRuntimeValue<{ readonly ready: boolean }>("value"),
    ).toEqual({ ready: true });

    runStore.dispose();
    expect(runStore.getSubscribers()).toEqual([]);
    expect(() => runStore.getRuntimeValue("value")).toThrow(
      "Run store disposed: run-1",
    );
  });

  it("should own run-scoped action handlers", () => {
    const runStore = createTestRunStore();
    runStore.registerAction(
      "resolve",
      (requestId: string, response: string): boolean =>
        requestId === "request-1" && response === "approved",
    );

    expect(runStore.invokeAction("resolve", "request-1", "approved")).toBe(
      true,
    );
    runStore.clearActions();
    expect(runStore.invokeAction("resolve", "request-1", "approved")).toBe(
      false,
    );
  });
});
