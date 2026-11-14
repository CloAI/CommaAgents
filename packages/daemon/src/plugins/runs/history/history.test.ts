import { afterEach, describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createRunsPlugin } from "../runs";
import {
  cleanupRunFixtures,
  createMockRunsPlugin,
  directories,
  fakeLoader,
  createRunDirectory,
} from "../test.utils";
afterEach(cleanupRunFixtures);
describe("run persistence", () => {
  it("should restore conversation separately from indexed display history after restart", async () => {
    const runsDir = createRunDirectory();
    const observed = { loads: [] as string[], restored: [] as string[][] };
    const runs = createMockRunsPlugin({
      runsDir,
      loadStrategy: fakeLoader(observed),
    });
    await runs.prepareRun({
      runId: "saved",
      configuration: {
        strategyPath: "example.json",
        cwd: "/saved",
      },
    });
    await runs.startRun("saved", "first").completion;
    const before = await runs.getHistory("saved");
    const messageId = before.entries.find(
      (message) => message.type === "message" && message.role === "agent",
    )!.messageId;
    await runs.dispose();
    const restarted = createMockRunsPlugin({
      runsDir,
      loadStrategy: fakeLoader(observed),
    });
    const snapshot = await restarted.getRun("saved");
    expect(snapshot).toMatchObject({
      phase: "terminal",
      configuration: { cwd: "/saved" },
      strategy: {
        name: "example",
        agents: ["writer"],
        flow: { type: "sequential" },
      },
      outcome: { status: "completed" },
    });
    expect(await restarted.getHistory("saved")).toEqual(before);
    const prepared = await restarted.prepareRun({ runId: "saved" });
    expect(prepared).not.toHaveProperty("conversation");
    expect(observed.restored).toEqual([[messageId]]);
    await restarted.startRun("saved", "second").completion;
    const path = join(directories.at(-1)!, "saved");
    const events = readFileSync(join(path, "conversation.jsonl"), "utf8")
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line));
    expect(events).toHaveLength(2);
    expect(events.every((event) => event.type === "agent_call")).toBe(true);
    expect(
      readFileSync(join(path, "conversation.jsonl"), "utf8"),
    ).not.toContain("strategyPath");
    await restarted.dispose();
  });
  it("should recover a persisted prepared run as interrupted without loading resources", async () => {
    const runs = createMockRunsPlugin({
      runsDir: createRunDirectory(),
      loadStrategy: fakeLoader({ loads: [], restored: [] }),
    });
    await runs.prepareRun({
      runId: "interrupted",
      configuration: { strategyPath: "example.json" },
    });
    const restarted = createRunsPlugin({ runsDir: directories.at(-1)! });
    expect(await restarted.getRun("interrupted")).toMatchObject({
      phase: "terminal",
      strategy: { name: "example" },
      outcome: { status: "interrupted" },
    });
    await restarted.dispose();
    await runs.dispose();
  });
});
