import { describe, expect, it } from "bun:test";
import type { ResponseMessage } from "./conversation-context.types";
import {
  contextUsageFromSteps,
  createConversationContext,
  createConversationRecord,
  parseConversationJson,
  parseConversationJsonl,
  parseConversationYaml,
  serializeConversationRecords,
  serializeConversationRecordsJson,
  serializeConversationRecordsYaml,
} from "./index";

function assistantResponse(text: string): ResponseMessage[] {
  return [{ role: "assistant", content: [{ type: "text", text }] }];
}

function makeRecord(
  id: string,
  agentName: string,
  userText: string,
  responseText: string,
) {
  return createConversationRecord({
    id,
    agentName,
    createdAt: `2026-01-01T00:00:0${id}.000Z`,
    userMessage: userText,
    responseMessages: assistantResponse(responseText),
    text: responseText,
    usage: { promptTokens: 10, completionTokens: 5 },
    contextUsage: { totalTokens: 15, inputTokens: 10, outputTokens: 5 },
    finishReason: "stop",
  });
}

describe("createConversationContext", () => {
  it("should append and expose conversation records", () => {
    const context = createConversationContext();
    const firstRecord = makeRecord("1", "assistant", "hello", "hi");
    const secondRecord = makeRecord("2", "assistant", "next", "done");

    context.appendRecord(firstRecord);
    context.appendRecord(secondRecord);

    expect(context.length).toBe(2);
    expect(context.isEmpty).toBe(false);
    expect(context.records()).toEqual([firstRecord, secondRecord]);
  });

  it("should project records into model messages", () => {
    const context = createConversationContext();
    context.appendRecord(makeRecord("1", "assistant", "question", "answer"));

    expect(context.messages()).toEqual([
      { role: "user", content: "question" },
      { role: "assistant", content: [{ type: "text", text: "answer" }] },
    ]);
  });

  it("should filter records and messages by agent name", () => {
    const context = createConversationContext();
    const writerRecord = makeRecord("1", "writer", "write", "written");
    const criticRecord = makeRecord("2", "critic", "review", "reviewed");
    context.importRecords([writerRecord, criticRecord]);

    expect(context.records("writer")).toEqual([writerRecord]);
    expect(context.messages("critic")).toEqual([
      { role: "user", content: "review" },
      { role: "assistant", content: [{ type: "text", text: "reviewed" }] },
    ]);
  });

  it("should import, export, and clear records", () => {
    const context = createConversationContext();
    const records = [
      makeRecord("1", "assistant", "first", "one"),
      makeRecord("2", "assistant", "second", "two"),
    ];

    context.importRecords(records);
    expect(context.exportRecords()).toEqual(records);

    context.clear();
    expect(context.isEmpty).toBe(true);
    expect(context.exportRecords()).toEqual([]);
  });

  it("should import and export conversation jsonl", () => {
    const records = [
      makeRecord("1", "assistant", "first", "one"),
      makeRecord("2", "assistant", "second", "two"),
    ];
    const jsonl = serializeConversationRecords(records);

    const context = createConversationContext();
    context.importJsonl(jsonl);

    expect(context.exportRecords()).toEqual(records);
    expect(parseConversationJsonl(context.exportJsonl())).toEqual(records);
  });

  it("should import and export conversation json and yaml", () => {
    const records = [
      makeRecord("1", "assistant", "first", "one"),
      makeRecord("2", "assistant", "second", "two"),
    ];
    const json = serializeConversationRecordsJson(records);
    const yaml = serializeConversationRecordsYaml(records);

    expect(parseConversationJson(json)).toEqual(records);
    expect(parseConversationYaml(yaml)).toEqual(records);
  });

  it("should reject invalid conversation jsonl records", () => {
    expect(() => parseConversationJsonl('{"id":"missing-fields"}\n')).toThrow(
      "Invalid conversation record on line 1",
    );
  });

  it("should exclude superseded records from the message projection", () => {
    const context = createConversationContext();
    context.importRecords([
      { ...makeRecord("1", "assistant", "old", "stale"), status: "superseded" },
      makeRecord("2", "assistant", "new", "fresh"),
    ]);

    expect(context.messages()).toEqual([
      { role: "user", content: "new" },
      { role: "assistant", content: [{ type: "text", text: "fresh" }] },
    ]);
    // Full history is retained for export/audit.
    expect(context.records()).toHaveLength(2);
  });

  describe("prepareForCall", () => {
    it("should be a no-op when no retention is configured", async () => {
      const context = createConversationContext();
      context.importRecords([makeRecord("1", "assistant", "hi", "yo")]);

      await context.prepareForCall({ agentName: "assistant" });

      expect(context.records()).toHaveLength(1);
      expect(context.records()[0]?.status).toBeUndefined();
    });

    it("should run a rolling window non-destructively", async () => {
      const context = createConversationContext({
        rollingWindow: 1,
      });
      context.importRecords([
        makeRecord("1", "assistant", "first", "one"),
        makeRecord("2", "assistant", "second", "two"),
      ]);

      await context.prepareForCall({ agentName: "assistant" });

      // LLM-visible context is just the window...
      expect(context.messages()).toEqual([
        { role: "user", content: "second" },
        { role: "assistant", content: [{ type: "text", text: "two" }] },
      ]);
      // ...but every record is retained, the dropped one tombstoned.
      expect(context.exportRecords()).toHaveLength(2);
      expect(context.exportRecords()[0]).toMatchObject({
        id: "1",
        status: "superseded",
      });
    });

    it("should return retention events from compaction", async () => {
      const context = createConversationContext({
        compaction: {
          keepRecent: 1,
          summarize: async (records) =>
            `summary: ${records.map((record) => record.id).join(",")}`,
        },
      });
      context.importRecords([
        makeRecord("1", "assistant", "first", "one"),
        makeRecord("2", "assistant", "second", "two"),
      ]);

      const events = await context.prepareForCall({
        agentName: "assistant",
        model: "mock/windowed",
        contextUsage: { totalTokens: 850 },
        contextWindow: 1_000,
      });

      expect(events).toHaveLength(1);
      expect(events[0]).toMatchObject({
        agentName: "assistant",
        kind: "compaction",
        reason: "context-window",
        recordsCompacted: 1,
        recordsRetained: 1,
        supersededRecordIds: ["1"],
      });
      expect(context.messages()).toEqual([
        {
          role: "user",
          content: "[Earlier conversation compacted - summary follows.]",
        },
        {
          role: "assistant",
          content: [{ type: "text", text: "summary: 1" }],
        },
        { role: "user", content: "second" },
        { role: "assistant", content: [{ type: "text", text: "two" }] },
      ]);
    });
  });
});

describe("contextUsageFromSteps", () => {
  it("should return final step context usage from flat AI SDK usage", () => {
    const steps = [
      { usage: { inputTokens: 10, outputTokens: 5 } },
      { usage: { inputTokens: 12, outputTokens: 6 } },
    ];

    expect(contextUsageFromSteps(steps)).toEqual({
      totalTokens: 18,
      inputTokens: 12,
      outputTokens: 6,
    });
  });

  it("should preserve final step token details", () => {
    const steps = [
      {
        usage: {
          inputTokens: 12,
          inputTokenDetails: {
            noCacheTokens: 7,
            cacheReadTokens: 3,
            cacheWriteTokens: 2,
          },
          outputTokens: 6,
          outputTokenDetails: {
            textTokens: 4,
            reasoningTokens: 2,
          },
          totalTokens: 18,
        },
      },
    ];

    expect(contextUsageFromSteps(steps)).toEqual({
      totalTokens: 18,
      inputTokens: 12,
      outputTokens: 6,
      inputTokenDetails: {
        noCacheTokens: 7,
        cacheReadTokens: 3,
        cacheWriteTokens: 2,
      },
      outputTokenDetails: {
        textTokens: 4,
        reasoningTokens: 2,
      },
    });
  });

  it("should normalize nested provider usage", () => {
    const steps = [
      {
        usage: {
          inputTokens: {
            total: 10,
            noCache: 5,
            cacheRead: 3,
            cacheWrite: 2,
          },
          outputTokens: { total: 20, text: 15, reasoning: 5 },
        },
      },
    ];

    expect(contextUsageFromSteps(steps)).toEqual({
      totalTokens: 30,
      inputTokens: 10,
      outputTokens: 20,
      inputTokenDetails: {
        noCacheTokens: 5,
        cacheReadTokens: 3,
        cacheWriteTokens: 2,
      },
      outputTokenDetails: {
        textTokens: 15,
        reasoningTokens: 5,
      },
    });
  });

  it("should return undefined when step usage is unavailable", () => {
    expect(contextUsageFromSteps([])).toBeUndefined();
    expect(contextUsageFromSteps([{ usage: {} }])).toBeUndefined();
  });
});
