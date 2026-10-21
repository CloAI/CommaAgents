import { afterEach, describe, expect, test } from "bun:test";
import {
  cleanupRunFixtures,
  createMockRunsPlugin,
  fakeLoader,
  repository,
} from "../test.utils";

afterEach(cleanupRunFixtures);

describe("run execution", () => {
  test("assigns a distinct request ID to each pending input", async () => {
    const runs = createMockRunsPlugin({
      repository: repository(),
      loadStrategy: fakeLoader({ loads: [], restored: [] }),
    });
    await runs.prepareRun({ runId: "input-1", strategyPath: "example.json" });
    const requests: string[] = [];
    await runs.notifications.subscribe(
      "run_input_requested",
      "input-1",
      (update) => {
        if (update.type === "run_input_requested")
          requests.push(update.requestId);
      },
    );
    const handle = runs.startRun("input-1", "needs-input");
    while (requests.length < 2) await Bun.sleep(1);
    expect(new Set(requests).size).toBe(2);
    expect(await runs.resolveInput("input-1", requests[0]!, "A")).toBe(true);
    expect(await runs.resolveInput("input-1", requests[1]!, "B")).toBe(true);
    const outcome = await handle.completion;
    expect(outcome.status).toBe("completed");
    if (outcome.status === "completed") expect(outcome.result.text).toBe("A,B");
    expect(
      (await runs.getHistory("input-1")).entries.flatMap((entry) =>
        entry.type === "message" && entry.role === "user"
          ? entry.content.flatMap((block) =>
              block.type === "text" ? [block.text] : [],
            )
          : [],
      ),
    ).toEqual(["needs-input", "A", "B"]);
  });

  test("stops a running flow and its pending input requests", async () => {
    const storage = repository();
    const runs = createMockRunsPlugin({
      repository: storage,
      loadStrategy: fakeLoader({ loads: [], restored: [] }),
    });
    await runs.prepareRun({ runId: "stop-1", strategyPath: "example.json" });
    const requests: string[] = [];
    await runs.notifications.subscribe(
      "run_input_requested",
      "stop-1",
      (update) => {
        if (update.type === "run_input_requested")
          requests.push(update.requestId);
      },
    );
    const handle = runs.startRun("stop-1", "needs-input");
    while (requests.length < 2) await Bun.sleep(1);
    await runs.stopRun("stop-1");
    expect((await handle.completion).status).toBe("cancelled");
    expect(await runs.resolveInput("stop-1", requests[0]!, "late")).toBe(false);
    const completed = (await storage.getEvents("stop-1")).at(-1);
    expect(completed?.type).toBe("run_completed");
    if (completed?.type === "run_completed") {
      expect(completed.status).toBe("cancelled");
    }
  });

  test("fails the run when a human answer cannot be persisted", async () => {
    const storage = repository();
    const runs = createMockRunsPlugin({
      repository: {
        ...storage,
        appendEvent(runId, event) {
          if (event.type === "user_input")
            throw new Error("answer write failed");
          return storage.appendEvent(runId, event);
        },
      },
      loadStrategy: fakeLoader({ loads: [], restored: [] }),
    });
    await runs.prepareRun({ runId: "answer-1", strategyPath: "example.json" });
    const requests: string[] = [];
    await runs.notifications.subscribe(
      "run_input_requested",
      "answer-1",
      (update) => {
        if (update.type === "run_input_requested")
          requests.push(update.requestId);
      },
    );
    const handle = runs.startRun("answer-1", "needs-input");
    while (requests.length < 2) await Bun.sleep(1);
    await expect(
      runs.resolveInput("answer-1", requests[0]!, "A"),
    ).rejects.toThrow("answer write failed");
    expect((await handle.completion).status).toBe("persistence_error");
  });

  test("history includes child records while continuation restores only parent records", async () => {
    const storage = repository();
    const observed = { loads: [] as string[], restored: [] as string[][] };
    const runs = createMockRunsPlugin({
      repository: storage,
      loadStrategy: fakeLoader(observed),
    });
    const scopes: string[] = [];
    runs.registerRunPreparation({
      name: "scope",
      prepare(context) {
        scopes.push(context.kind);
        return {};
      },
    });
    await runs.prepareRun({ runId: "parent-1", strategyPath: "example.json" });
    const outcome = await runs.startRun("parent-1", "child").completion;
    expect(outcome.status).toBe("completed");
    expect(scopes).toEqual(["root", "child"]);
    const records = (await storage.getEvents("parent-1")).filter(
      (event) => event.type === "agent_call",
    );
    expect(records).toHaveLength(2);
    expect(
      records.filter((event) => event.parentRunId === "parent-1"),
    ).toHaveLength(1);
    const history = await runs.getHistory("parent-1");
    expect(history.entries.every((entry) => entry.runId === "parent-1")).toBe(
      true,
    );
    expect(history.entries.some((entry) => entry.type === "child.run")).toBe(
      true,
    );

    const prepared = await runs.prepareRun({ runId: "parent-1" });
    expect(prepared.phase).toBe("prepared");
    expect(observed.restored.at(-1)).toHaveLength(1);
    await runs.stopRun("parent-1");
  });

  test("retains the live result when durable completion fails", async () => {
    const storage = repository();
    let failCompletion = true;
    const runs = createMockRunsPlugin({
      repository: {
        ...storage,
        appendEvent(runId, event) {
          if (event.type === "run_completed" && failCompletion) {
            failCompletion = false;
            throw new Error("completion write failed");
          }
          return storage.appendEvent(runId, event);
        },
      },
      loadStrategy: fakeLoader({ loads: [], restored: [] }),
    });
    await runs.prepareRun({
      runId: "completion-1",
      strategyPath: "example.json",
    });
    const outcome = await runs.startRun("completion-1", "answer").completion;
    expect(outcome.status).toBe("persistence_error");
    if (outcome.status === "persistence_error") {
      expect(outcome.result?.text).toBe("answer");
      expect(outcome.summary?.text).toBe("answer");
    }
    const snapshot = await runs.getRun("completion-1");
    expect(snapshot?.outcome?.status).toBe("persistence_error");
    const reloaded = createMockRunsPlugin({
      repository: storage,
      loadStrategy: fakeLoader({ loads: [], restored: [] }),
    });
    expect((await reloaded.getRun("completion-1"))?.outcome?.status).toBe(
      "persistence_error",
    );
  });

  test("rejects required-write failures and blocks continuation", async () => {
    const storage = repository();
    const runs = createMockRunsPlugin({
      repository: {
        ...storage,
        appendEvent(runId, event) {
          if (event.type === "agent_call") throw new Error("disk full");
          return storage.appendEvent(runId, event);
        },
      },
      loadStrategy: fakeLoader({ loads: [], restored: [] }),
    });
    await runs.prepareRun({ runId: "broken-1", strategyPath: "example.json" });
    const outcome = await runs.startRun("broken-1", "hello").completion;
    expect(outcome.status).toBe("persistence_error");
    expect(() => runs.prepareRun({ runId: "broken-1" })).toThrow();
    const events = await storage.getEvents("broken-1");
    const completed = events.at(-1);
    expect(completed?.type).toBe("run_completed");
    if (completed?.type === "run_completed") {
      expect(completed.error?.code).toBe("PERSISTENCE_ERROR");
    }
  });
  test("should cancel active preparation and clean up once", async () => {
    const runs = createMockRunsPlugin({
      repository: repository(),
      loadStrategy: fakeLoader({ loads: [], restored: [] }),
    });
    const preparationEntered = Promise.withResolvers<void>();
    const allowPreparation = Promise.withResolvers<void>();
    const cleanup: string[] = [];
    runs.registerRunPreparation({
      name: "resource",
      async prepare() {
        preparationEntered.resolve();
        await allowPreparation.promise;
        return {
          dispose: () => {
            cleanup.push("resource");
          },
        };
      },
    });
    const preparation = runs.prepareRun({
      runId: "shutdown",
      strategyPath: "example.json",
    });
    await preparationEntered.promise;
    const disposal = runs.dispose();
    expect(runs.dispose()).toBe(disposal);
    allowPreparation.resolve();
    await disposal;
    expect((await preparation).phase).toBe("cancelled");
    expect(cleanup).toEqual(["resource"]);
    expect(runs.dispose()).toBe(disposal);
  });
});
