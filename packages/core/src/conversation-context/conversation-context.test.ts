import { describe, expect, it } from "bun:test";
import type { ResponseMessage } from "./conversation-context.types";
import {
  contextTokensFromSteps,
  createConversationContext,
  createConversationRecord,
  parseConversationJsonl,
  serializeConversationRecords,
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
    contextTokens: 15,
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
  });
});

describe("contextTokensFromSteps", () => {
  it("should return final step context usage", () => {
    const steps = [
      { usage: { inputTokens: 10, outputTokens: 5 } },
      { usage: { inputTokens: 12, outputTokens: 6 } },
    ];

    expect(contextTokensFromSteps(steps)).toBe(18);
  });

  it("should return undefined when step usage is unavailable", () => {
    expect(contextTokensFromSteps([])).toBeUndefined();
    expect(contextTokensFromSteps([{ usage: {} }])).toBeUndefined();
  });
});
