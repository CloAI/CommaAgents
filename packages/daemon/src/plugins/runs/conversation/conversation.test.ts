import { describe, expect, it } from "bun:test";
import { conversationFromEvents } from "./conversation";
import { ConversationEventSchema } from "./conversation.schemas";
const record = {
  id: "original",
  agentName: "writer",
  createdAt: "2026-10-20T00:00:00.000Z",
  userMessage: { role: "user" as const, content: "input" },
  responseMessages: [],
  text: "answer",
  usage: { promptTokens: 1, completionTokens: 2 },
  finishReason: "stop",
};
describe("conversation restoration", () => {
  it("should replay retention without changing original records or visible history", () => {
    const restored = conversationFromEvents([
      { type: "agent_call", record },
      { type: "agent_call", record: { ...record, id: "recent" } },
      {
        type: "conversation_retention",
        event: {
          id: "retention",
          agentName: "writer",
          createdAt: record.createdAt,
          kind: "compaction",
          reason: "record-count",
          trigger: {},
          recordsCompacted: 1,
          recordsRetained: 1,
          summaryRecord: { ...record, id: "summary", text: "summary" },
          supersededRecordIds: [record.id],
          insertBeforeRecordId: "recent",
        },
      },
    ]);
    expect(restored.records.map((record) => record.id)).toEqual([
      "original",
      "summary",
      "recent",
    ]);
    expect(restored.records[0]).toMatchObject({
      status: "superseded",
      supersededBy: "summary",
    });
    expect(record).not.toHaveProperty("status");
  });
  it("should reject corrupt canonical records at the storage boundary", () => {
    expect(
      ConversationEventSchema.safeParse({
        type: "agent_call",
        record: {
          ...record,
          usage: { promptTokens: "invalid", completionTokens: 0 },
        },
      }).success,
    ).toBe(false);
    expect(
      ConversationEventSchema.safeParse({
        type: "run_started",
        strategyPath: "legacy.json",
      }).success,
    ).toBe(false);
  });
});
