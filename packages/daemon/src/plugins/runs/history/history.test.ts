import { afterEach, describe, expect, test } from "bun:test";
import type { TimelineEvent } from "@comma-agents/core";
import {
  cleanupRunFixtures,
  createMockRunsPlugin,
  fakeLoader,
  repository,
} from "../test.utils";

afterEach(cleanupRunFixtures);

describe("run timeline reads", () => {
  test("should project own display history while preserving the timeline and restoring retained model context", async () => {
    const storage = repository();
    const originalRecord = {
      id: "original",
      agentName: "writer",
      createdAt: "2026-01-01T00:00:00.000Z",
      userMessage: { role: "user" as const, content: "first" },
      responseMessages: [],
      text: "answer",
      usage: { promptTokens: 1, completionTokens: 2 },
      finishReason: "stop",
    };
    const events: TimelineEvent[] = [
      {
        type: "run_started",
        ts: originalRecord.createdAt,
        strategyPath: "example.json",
        strategyName: "example",
        cwd: "/workspace",
        initialInput: "first",
      },
      {
        type: "step_started",
        ts: originalRecord.createdAt,
        stepName: "writer",
      },
      {
        type: "agent_call",
        ts: originalRecord.createdAt,
        record: originalRecord,
      },
      {
        type: "agent_call",
        ts: originalRecord.createdAt,
        record: { ...originalRecord, id: "recent" },
      },
      {
        type: "conversation_retention",
        ts: originalRecord.createdAt,
        event: {
          id: "retention",
          agentName: "writer",
          createdAt: originalRecord.createdAt,
          kind: "compaction",
          reason: "record-count",
          trigger: {},
          recordsCompacted: 1,
          recordsRetained: 1,
          summaryRecord: {
            ...originalRecord,
            id: "summary",
            text: "summary text",
          },
          supersededRecordIds: ["original"],
          insertBeforeRecordId: "recent",
        },
      },
      {
        type: "agent_call",
        ts: originalRecord.createdAt,
        runId: "child",
        record: { ...originalRecord, id: "child-record" },
      },
    ];
    for (const event of events) await storage.appendEvent("retained", event);
    const observed = { loads: [] as string[], restored: [] as string[][] };
    const runs = createMockRunsPlugin({
      repository: storage,
      loadStrategy: fakeLoader(observed),
    });
    expect(
      (await runs.getHistory("retained")).entries.map(
        (entry) => entry.messageId,
      ),
    ).toEqual([expect.any(String), "original", "recent"]);
    expect(await storage.getEvents("retained")).toEqual(events);
    const prepared = await runs.prepareRun({ runId: "retained" });
    expect(observed.restored).toEqual([["original", "summary", "recent"]]);
    if (prepared.phase !== "cancelled") {
      expect(prepared.conversation?.records[0]).toMatchObject({
        status: "superseded",
        supersededBy: "summary",
      });
      expect(prepared.conversation).not.toHaveProperty("inputs");
    }
    expect(
      (await runs.getHistory("retained")).entries.map(
        (entry) => entry.messageId,
      ),
    ).toEqual([expect.any(String), "original", "recent"]);
    expect(await storage.getEvents("retained")).toEqual(events);
    expect(originalRecord).not.toHaveProperty("status");
    await runs.stopRun("retained");
  });
});
