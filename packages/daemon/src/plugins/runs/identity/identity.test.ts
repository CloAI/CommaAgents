import { afterEach, describe, expect, test } from "bun:test";
import { createRunsPlugin } from "../runs";
import type { RunIdentity } from "../runs.types";
import type { RunStatus } from "../runs.notifications";
import {
  cleanupRunFixtures,
  createMockRunsPlugin,
  directories,
  fakeLoader,
  repository,
} from "../test.utils";

afterEach(cleanupRunFixtures);

describe("run identity", () => {
  test("should retain immediate parents, group nested output, and recover history ownership after restart", async () => {
    const storage = repository();
    const observed = { loads: [] as string[], restored: [] as string[][] };
    const runs = createMockRunsPlugin({
      repository: storage,
      loadStrategy: fakeLoader(observed),
    });
    const preparations: RunIdentity[] = [];
    runs.registerRunPreparation({
      name: "identity-check",
      prepare(scope) {
        preparations.push({
          runId: scope.runId,
          ...(scope.parentRunId ? { parentRunId: scope.parentRunId } : {}),
        });
        return {};
      },
    });
    await runs.prepareRun({ runId: "root", strategyPath: "example.json" });
    const updates: RunStatus[] = [];
    await runs.notifications.subscribe("run_agent_output", "root", (update) => {
      updates.push(update);
    });
    expect((await runs.startRun("root", "nested").completion).status).toBe(
      "completed",
    );
    const [root, child, grandchild] = preparations;
    expect(root).toEqual({ runId: "root" });
    expect(child?.parentRunId).toBe("root");
    expect(grandchild?.parentRunId).toBe(child?.runId);
    expect(new Set(preparations.map((identity) => identity.runId)).size).toBe(
      3,
    );
    expect(runs.getRunLineage(grandchild!.runId)).toEqual([
      grandchild!,
      child!,
      root!,
    ]);
    expect(
      updates
        .filter((update) => update.type === "run_agent_output")
        .map((update) => update.runId),
    ).toEqual([grandchild!.runId, child!.runId, "root"]);
    const history = await runs.getHistory("root");
    expect(history.entries.every((entry) => entry.runId === "root")).toBe(true);
    expect(
      history.entries.some(
        (entry) =>
          entry.type === "child.run" && entry.childRunId === child!.runId,
      ),
    ).toBe(true);
    const grandchildHistory = await runs.getHistory(grandchild!.runId);
    expect(
      grandchildHistory.entries.every(
        (entry) => entry.runId === grandchild!.runId,
      ),
    ).toBe(true);
    expect(await storage.getEvents(child!.runId)).toEqual([]);
    expect((await storage.listRuns()).map((run) => run.runId)).toEqual([
      "root",
    ]);
    await runs.dispose();

    const restarted = createRunsPlugin({ runsDir: directories.at(-1)! });
    expect(await restarted.getHistory(grandchild!.runId)).toEqual(
      grandchildHistory,
    );
    expect(restarted.getRunLineage(grandchild!.runId)).toEqual([
      grandchild!,
      child!,
      root!,
    ]);
    expect(await restarted.getRun(child!.runId)).toMatchObject({
      runId: child!.runId,
      parentRunId: "root",
      phase: "terminal",
      strategyPath: "child.json",
    });
    const prepared = await restarted.prepareRun({ runId: child!.runId });
    expect(prepared.phase).toBe("prepared");
    if (prepared.phase !== "cancelled") {
      expect(prepared.conversation?.records).toHaveLength(1);
      const childRecord = (
        await restarted.getHistory(child!.runId)
      ).entries.find(
        (entry) => entry.type === "message" && entry.role === "agent",
      );
      expect(prepared.conversation?.records[0]?.id).toBe(
        childRecord?.messageId,
      );
    }
    expect(
      (await restarted.continueRun(child!.runId, "continued child").completion)
        .status,
    ).toBe("completed");
    expect(await restarted.getRun("root")).toMatchObject({
      runId: "root",
      strategyPath: "example.json",
    });
    await restarted.dispose();
  });

  test("should reject missing parents and cycles rather than inventing history ownership", async () => {
    const storage = repository();
    await storage.saveRunIdentity({ runId: "orphan", parentRunId: "missing" });
    await storage.saveRunIdentity({ runId: "cycle-a", parentRunId: "cycle-b" });
    await storage.saveRunIdentity({ runId: "cycle-b", parentRunId: "cycle-a" });
    const runs = createMockRunsPlugin({
      repository: storage,
      loadStrategy: fakeLoader({ loads: [], restored: [] }),
    });
    await expect(runs.getHistory("orphan")).rejects.toThrow(
      "Missing parent run",
    );
    await expect(runs.getHistory("cycle-a")).rejects.toThrow(
      "Cyclic run ancestry",
    );
    expect(() => runs.getRunLineage("unknown")).toThrow("Missing run identity");
    await runs.dispose();
  });
});
