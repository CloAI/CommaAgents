import { describe, expect, it } from "bun:test";
import type { AgentCallResult } from "@comma-agents/core";
import { createDaemonStore } from "./daemon-store";
import type { DaemonAction } from "./daemon-store.types";

const result: AgentCallResult = {
  text: "done",
  usage: { promptTokens: 10, completionTokens: 5 },
  finishReason: "stop",
  responseMessages: [],
  steps: [],
};

describe("createDaemonStore", () => {
  describe("runs", () => {
    it("should create a pending run", () => {
      const store = createDaemonStore();

      const run = store.createRun(
        "/strategy.json",
        "Test",
        "/workspace",
        "run-1",
      );

      expect(run).toEqual({
        id: "run-1",
        strategyPath: "/strategy.json",
        strategyName: "Test",
        startedAt: expect.any(Date),
        cwd: "/workspace",
        status: "pending",
      });
    });

    it("should return snapshots instead of authoritative run records", () => {
      const store = createDaemonStore();
      const run = store.createRun("/strategy.json", "Test", "/workspace");
      (run as { status: string }).status = "completed";

      expect(store.getRun(run.id)?.status).toBe("pending");
    });

    it("should emit semantic run lifecycle actions", () => {
      const store = createDaemonStore();
      const actions: DaemonAction[] = [];
      store.subscribeToActions((action): void => {
        actions.push(action);
      });
      const run = store.createRun(
        "/strategy.json",
        "Test",
        "/workspace",
        "run-1",
      );

      store.startRun(run.id);
      store.completeRun(run.id, result);

      expect(actions.map((action) => action.type)).toEqual([
        "run.created",
        "run.started",
        "run.completed",
      ]);
      expect(store.getRun(run.id)?.result).toBe(result);
    });

    it("should enforce lifecycle transitions", () => {
      const store = createDaemonStore();
      const run = store.createRun("/strategy.json", "Test", "/workspace");
      store.startRun(run.id);
      store.completeRun(run.id, result);

      expect(() => store.startRun(run.id)).toThrow(
        "Invalid run status transition: completed -> running",
      );
    });

    it("should abort and emit cancellation exactly once", () => {
      const store = createDaemonStore();
      const actions: DaemonAction[] = [];
      const run = store.createRun("/strategy.json", "Test", "/workspace");
      const signal = store.getAbortSignal(run.id);
      store.subscribeToActions((action): void => {
        actions.push(action);
      });

      store.cancelRun(run.id);
      store.cancelRun(run.id);

      expect(signal.aborted).toBe(true);
      expect(actions.map((action) => action.type)).toEqual(["run.cancelled"]);
    });

    it("should emit removals with lost subscription information", () => {
      const store = createDaemonStore();
      const actions: DaemonAction[] = [];
      const run = store.createRun("/strategy.json", "Test", "/workspace");
      store.addClient("client-1");
      store.subscribe("client-1", run.id);
      store.subscribeToActions((action): void => {
        actions.push(action);
      });

      store.removeRun(run.id);

      expect(actions).toEqual([
        { type: "run.removed", run, removedClientIds: ["client-1"] },
      ]);
    });
  });

  describe("clients and subscriptions", () => {
    it("should emit client removal with removed run identifiers", () => {
      const store = createDaemonStore();
      const actions: DaemonAction[] = [];
      const run = store.createRun("/strategy.json", "Test", "/workspace");
      store.addClient("client-1");
      store.subscribe("client-1", run.id);
      store.subscribeToActions((action): void => {
        actions.push(action);
      });

      store.removeClient("client-1");

      expect(actions).toEqual([
        {
          type: "client.removed",
          clientId: "client-1",
          removedRunIds: [run.id],
        },
      ]);
    });

    it("should not emit idempotent client or subscription operations", () => {
      const store = createDaemonStore();
      const run = store.createRun("/strategy.json", "Test", "/workspace");
      store.addClient("client-1");
      store.subscribe("client-1", run.id);
      const actions: DaemonAction[] = [];
      store.subscribeToActions((action): void => {
        actions.push(action);
      });

      store.addClient("client-1");
      store.subscribe("client-1", run.id);
      store.unsubscribe("client-1", "unknown-run");

      expect(actions).toEqual([]);
    });
  });

  describe("listeners", () => {
    it("should notify listeners in order", () => {
      const calls: string[] = [];
      const store = createDaemonStore();
      store.subscribeToActions((): void => {
        calls.push("first");
      });
      store.subscribeToActions((): void => {
        calls.push("second");
      });

      store.addClient("client-1");

      expect(calls).toEqual(["first", "second"]);
    });

    it("should stop notifying an unsubscribed listener", () => {
      const store = createDaemonStore();
      const actions: DaemonAction[] = [];
      const unsubscribe = store.subscribeToActions((action): void => {
        actions.push(action);
      });
      unsubscribe();

      store.addClient("client-1");

      expect(actions).toEqual([]);
    });
  });
});
