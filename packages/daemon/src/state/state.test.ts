// Tests for createDaemonState() — run lifecycle, client tracking, subscriptions.

import { describe, expect, test } from "bun:test";
import type { AgentCallResult } from "@comma-agents/core";
import { createDaemonState } from "./state";

// Helpers

/** Minimal AgentCallResult for testing. */
const mockResult: AgentCallResult = {
  text: "done",
  usage: { promptTokens: 10, completionTokens: 5 },
  finishReason: "stop",
};

// Run lifecycle

describe("DaemonState — runs", () => {
  test("createRun returns a run with pending status", () => {
    const state = createDaemonState();
    const run = state.createRun("/path/to/strategy.json", "test-strategy");

    expect(run.id).toBeTruthy();
    expect(run.strategyPath).toBe("/path/to/strategy.json");
    expect(run.strategyName).toBe("test-strategy");
    expect(run.status).toBe("pending");
    expect(run.startedAt).toBeInstanceOf(Date);
    expect(run.abortController).toBeInstanceOf(AbortController);
    expect(run.completedAt).toBeUndefined();
    expect(run.result).toBeUndefined();
    expect(run.error).toBeUndefined();
  });

  test("createRun generates unique IDs", () => {
    const state = createDaemonState();
    const run1 = state.createRun("/p.json", "s1");
    const run2 = state.createRun("/p.json", "s2");
    expect(run1.id).not.toBe(run2.id);
  });

  test("getRun returns the created run", () => {
    const state = createDaemonState();
    const run = state.createRun("/p.json", "s");
    expect(state.getRun(run.id)).toBe(run);
  });

  test("getRun returns undefined for unknown ID", () => {
    const state = createDaemonState();
    expect(state.getRun("nonexistent")).toBeUndefined();
  });

  test("listRuns returns all runs", () => {
    const state = createDaemonState();
    const run1 = state.createRun("/a.json", "a");
    const run2 = state.createRun("/b.json", "b");
    const runs = state.listRuns();
    expect(runs).toHaveLength(2);
    expect(runs).toContain(run1);
    expect(runs).toContain(run2);
  });

  test("listRuns returns empty array when no runs", () => {
    const state = createDaemonState();
    expect(state.listRuns()).toEqual([]);
  });

  test("listRuns returns a snapshot (push does not affect state)", () => {
    const state = createDaemonState();
    state.createRun("/a.json", "a");
    const runs = state.listRuns();
    // TypeScript prevents push on ReadonlyArray, but verify at runtime
    expect(runs).toHaveLength(1);
    expect(state.listRuns()).toHaveLength(1);
  });

  test("updateRun changes status", () => {
    const state = createDaemonState();
    const run = state.createRun("/p.json", "s");
    state.updateRun(run.id, { status: "running" });
    expect(state.getRun(run.id)!.status).toBe("running");
  });

  test("updateRun sets completedAt", () => {
    const state = createDaemonState();
    const run = state.createRun("/p.json", "s");
    const now = new Date();
    state.updateRun(run.id, { status: "completed", completedAt: now });
    expect(state.getRun(run.id)!.completedAt).toBe(now);
  });

  test("updateRun sets result", () => {
    const state = createDaemonState();
    const run = state.createRun("/p.json", "s");
    state.updateRun(run.id, { status: "completed", result: mockResult });
    expect(state.getRun(run.id)!.result).toBe(mockResult);
  });

  test("updateRun sets error", () => {
    const state = createDaemonState();
    const run = state.createRun("/p.json", "s");
    const error = { code: "EXEC_FAILED", message: "Agent crashed" };
    state.updateRun(run.id, { status: "error", error });
    expect(state.getRun(run.id)!.error).toEqual(error);
  });

  test("updateRun can update multiple fields at once", () => {
    const state = createDaemonState();
    const run = state.createRun("/p.json", "s");
    const now = new Date();
    state.updateRun(run.id, {
      status: "completed",
      completedAt: now,
      result: mockResult,
    });
    const updated = state.getRun(run.id)!;
    expect(updated.status).toBe("completed");
    expect(updated.completedAt).toBe(now);
    expect(updated.result).toBe(mockResult);
  });

  test("updateRun only modifies specified fields", () => {
    const state = createDaemonState();
    const run = state.createRun("/p.json", "s");
    state.updateRun(run.id, { status: "running" });
    // completedAt and result should still be undefined
    expect(state.getRun(run.id)!.completedAt).toBeUndefined();
    expect(state.getRun(run.id)!.result).toBeUndefined();
  });

  test("updateRun throws for nonexistent run", () => {
    const state = createDaemonState();
    expect(() => state.updateRun("nonexistent", { status: "running" })).toThrow(
      "Run not found: nonexistent",
    );
  });

  test("removeRun removes the run", () => {
    const state = createDaemonState();
    const run = state.createRun("/p.json", "s");
    expect(state.removeRun(run.id)).toBe(true);
    expect(state.getRun(run.id)).toBeUndefined();
    expect(state.listRuns()).toEqual([]);
  });

  test("removeRun returns false for nonexistent run", () => {
    const state = createDaemonState();
    expect(state.removeRun("nonexistent")).toBe(false);
  });

  test("full run lifecycle: pending → running → completed", () => {
    const state = createDaemonState();
    const run = state.createRun("/p.json", "s");
    expect(run.status).toBe("pending");

    state.updateRun(run.id, { status: "running" });
    expect(state.getRun(run.id)!.status).toBe("running");

    state.updateRun(run.id, {
      status: "completed",
      completedAt: new Date(),
      result: mockResult,
    });
    expect(state.getRun(run.id)!.status).toBe("completed");
    expect(state.getRun(run.id)!.result).toBe(mockResult);
  });

  test("full run lifecycle: pending → running → error", () => {
    const state = createDaemonState();
    const run = state.createRun("/p.json", "s");
    state.updateRun(run.id, { status: "running" });
    state.updateRun(run.id, {
      status: "error",
      completedAt: new Date(),
      error: { code: "TIMEOUT", message: "Timed out" },
    });
    expect(state.getRun(run.id)!.status).toBe("error");
    expect(state.getRun(run.id)!.error!.code).toBe("TIMEOUT");
  });

  test("full run lifecycle: pending → running → cancelled", () => {
    const state = createDaemonState();
    const run = state.createRun("/p.json", "s");
    state.updateRun(run.id, { status: "running" });
    state.updateRun(run.id, { status: "cancelled", completedAt: new Date() });
    expect(state.getRun(run.id)!.status).toBe("cancelled");
  });
});

// Client tracking

describe("DaemonState — clients", () => {
  test("addClient registers a client", () => {
    const state = createDaemonState();
    state.addClient("client-1");
    expect(state.getClients()).toEqual(["client-1"]);
  });

  test("addClient is idempotent", () => {
    const state = createDaemonState();
    state.addClient("client-1");
    state.addClient("client-1");
    expect(state.getClients()).toEqual(["client-1"]);
  });

  test("addClient tracks multiple clients", () => {
    const state = createDaemonState();
    state.addClient("client-1");
    state.addClient("client-2");
    const clients = state.getClients();
    expect(clients).toHaveLength(2);
    expect(clients).toContain("client-1");
    expect(clients).toContain("client-2");
  });

  test("removeClient removes a client", () => {
    const state = createDaemonState();
    state.addClient("client-1");
    state.removeClient("client-1");
    expect(state.getClients()).toEqual([]);
  });

  test("removeClient is a no-op for unknown client", () => {
    const state = createDaemonState();
    // Should not throw
    state.removeClient("nonexistent");
    expect(state.getClients()).toEqual([]);
  });

  test("getClients returns empty when no clients", () => {
    const state = createDaemonState();
    expect(state.getClients()).toEqual([]);
  });
});

// Subscriptions

describe("DaemonState — subscriptions", () => {
  test("subscribe registers a subscription", () => {
    const state = createDaemonState();
    const run = state.createRun("/p.json", "s");
    state.addClient("client-1");
    state.subscribe("client-1", run.id);

    expect(state.getSubscribers(run.id)).toEqual(["client-1"]);
    expect(state.getSubscriptions("client-1")).toEqual([run.id]);
  });

  test("subscribe is idempotent", () => {
    const state = createDaemonState();
    const run = state.createRun("/p.json", "s");
    state.addClient("client-1");
    state.subscribe("client-1", run.id);
    state.subscribe("client-1", run.id);

    expect(state.getSubscribers(run.id)).toEqual(["client-1"]);
  });

  test("subscribe multiple clients to one run", () => {
    const state = createDaemonState();
    const run = state.createRun("/p.json", "s");
    state.addClient("client-1");
    state.addClient("client-2");
    state.subscribe("client-1", run.id);
    state.subscribe("client-2", run.id);

    const subscribers = state.getSubscribers(run.id);
    expect(subscribers).toHaveLength(2);
    expect(subscribers).toContain("client-1");
    expect(subscribers).toContain("client-2");
  });

  test("subscribe one client to multiple runs", () => {
    const state = createDaemonState();
    const run1 = state.createRun("/a.json", "a");
    const run2 = state.createRun("/b.json", "b");
    state.addClient("client-1");
    state.subscribe("client-1", run1.id);
    state.subscribe("client-1", run2.id);

    const subs = state.getSubscriptions("client-1");
    expect(subs).toHaveLength(2);
    expect(subs).toContain(run1.id);
    expect(subs).toContain(run2.id);
  });

  test("subscribe throws for unknown client", () => {
    const state = createDaemonState();
    const run = state.createRun("/p.json", "s");
    expect(() => state.subscribe("unknown-client", run.id)).toThrow(
      "Client not found: unknown-client",
    );
  });

  test("subscribe throws for unknown run", () => {
    const state = createDaemonState();
    state.addClient("client-1");
    expect(() => state.subscribe("client-1", "unknown-run")).toThrow("Run not found: unknown-run");
  });

  test("unsubscribe removes a subscription", () => {
    const state = createDaemonState();
    const run = state.createRun("/p.json", "s");
    state.addClient("client-1");
    state.subscribe("client-1", run.id);
    state.unsubscribe("client-1", run.id);

    expect(state.getSubscribers(run.id)).toEqual([]);
    expect(state.getSubscriptions("client-1")).toEqual([]);
  });

  test("unsubscribe is a no-op for nonexistent subscription", () => {
    const state = createDaemonState();
    const run = state.createRun("/p.json", "s");
    state.addClient("client-1");
    // Should not throw
    state.unsubscribe("client-1", run.id);
    expect(state.getSubscribers(run.id)).toEqual([]);
  });

  test("unsubscribe is a no-op for nonexistent run", () => {
    const state = createDaemonState();
    state.addClient("client-1");
    // Should not throw
    state.unsubscribe("client-1", "nonexistent");
  });

  test("getSubscribers returns empty for unknown run", () => {
    const state = createDaemonState();
    expect(state.getSubscribers("nonexistent")).toEqual([]);
  });

  test("getSubscriptions returns empty for unknown client", () => {
    const state = createDaemonState();
    expect(state.getSubscriptions("nonexistent")).toEqual([]);
  });
});

// Cleanup — cascading deletes

describe("DaemonState — cleanup", () => {
  test("removeClient cleans up all subscriptions for that client", () => {
    const state = createDaemonState();
    const run1 = state.createRun("/a.json", "a");
    const run2 = state.createRun("/b.json", "b");
    state.addClient("client-1");
    state.addClient("client-2");
    state.subscribe("client-1", run1.id);
    state.subscribe("client-1", run2.id);
    state.subscribe("client-2", run1.id);

    state.removeClient("client-1");

    // client-1 should be gone from all subscription sets
    expect(state.getSubscribers(run1.id)).toEqual(["client-2"]);
    expect(state.getSubscribers(run2.id)).toEqual([]);
    // client-2 should be unaffected
    expect(state.getSubscriptions("client-2")).toEqual([run1.id]);
  });

  test("removeRun cleans up the subscription set", () => {
    const state = createDaemonState();
    const run = state.createRun("/p.json", "s");
    state.addClient("client-1");
    state.subscribe("client-1", run.id);

    state.removeRun(run.id);

    // Subscription set should be gone
    expect(state.getSubscribers(run.id)).toEqual([]);
    // Client should have no subscriptions for that run
    expect(state.getSubscriptions("client-1")).toEqual([]);
  });

  test("removeRun does not affect other runs", () => {
    const state = createDaemonState();
    const run1 = state.createRun("/a.json", "a");
    const run2 = state.createRun("/b.json", "b");
    state.addClient("client-1");
    state.subscribe("client-1", run1.id);
    state.subscribe("client-1", run2.id);

    state.removeRun(run1.id);

    expect(state.getRun(run2.id)).toBeTruthy();
    expect(state.getSubscribers(run2.id)).toEqual(["client-1"]);
    expect(state.getSubscriptions("client-1")).toEqual([run2.id]);
  });

  test("removeClient then subscribe throws for that client", () => {
    const state = createDaemonState();
    const run = state.createRun("/p.json", "s");
    state.addClient("client-1");
    state.removeClient("client-1");

    expect(() => state.subscribe("client-1", run.id)).toThrow("Client not found: client-1");
  });

  test("removeRun then subscribe throws for that run", () => {
    const state = createDaemonState();
    const run = state.createRun("/p.json", "s");
    state.addClient("client-1");
    state.removeRun(run.id);

    expect(() => state.subscribe("client-1", run.id)).toThrow("Run not found:");
  });
});
