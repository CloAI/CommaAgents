import { afterEach, describe, expect, it } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import {
  cleanupRunFixtures,
  createMockRunsPlugin,
  directories,
  fakeLoader,
  createRunDirectory,
} from "../test.utils";
afterEach(cleanupRunFixtures);
describe("run ancestry", () => {
  it("should store each descendant independently and load parent links after restart", async () => {
    const runsDir = createRunDirectory();
    const runs = createMockRunsPlugin({
      runsDir,
      loadStrategy: fakeLoader({ loads: [], restored: [] }),
    });
    await runs.prepareRun({
      runId: "parent",
      configuration: { strategyPath: "example.json" },
    });
    await runs.startRun("parent", "nested").completion;
    const parent = await runs.getHistory("parent");
    const child = parent.entries.find((entry) => entry.type === "child.run");
    if (child?.type !== "child.run") {
      throw new Error("Missing child reference");
    }
    const children = await runs.getHistory(child.childRunId);
    const grandchild = children.entries.find(
      (entry) => entry.type === "child.run",
    );
    if (grandchild?.type !== "child.run") {
      throw new Error("Missing grandchild reference");
    }
    expect(parent.entries.every((entry) => entry.runId === "parent")).toBe(
      true,
    );
    const cwd = directories.at(-1)!;
    for (const runId of ["parent", child.childRunId, grandchild.childRunId]) {
      expect(existsSync(join(cwd, runId, "run.json"))).toBe(true);
      const events = readFileSync(
        join(cwd, runId, "conversation.jsonl"),
        "utf8",
      );
      expect(events.trim().split("\n")).toHaveLength(1);
    }
    await runs.dispose();
    const restarted = createMockRunsPlugin({
      runsDir,
      loadStrategy: fakeLoader({ loads: [], restored: [] }),
    });
    await restarted.getHistory(grandchild.childRunId);
    expect(
      restarted
        .getRunLineage(grandchild.childRunId)
        .map((identity) => identity.runId),
    ).toEqual([grandchild.childRunId, child.childRunId, "parent"]);
    await restarted.dispose();
  });
});
