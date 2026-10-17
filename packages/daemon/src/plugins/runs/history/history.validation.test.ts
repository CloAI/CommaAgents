import { expect, test } from "bun:test";
import type { TimelineEvent } from "@comma-agents/core";
import { validateRunTimeline } from "./history.validation";

const record = {
  id: "record",
  agentName: "writer",
  createdAt: "2026-01-01",
  userMessage: { role: "user", content: "hello" },
  responseMessages: [],
  text: "answer",
  usage: {},
  finishReason: "stop",
  extra: "preserved",
};

/**
 * Validate raw persisted input at the typed timeline boundary.
 * @param {unknown} events - Raw timeline records.
 * @returns {void} Nothing when valid.
 */
function validate(events: unknown): void {
  validateRunTimeline(events as readonly TimelineEvent[]);
}

test("validation accepts existing record shapes without changing the timeline", () => {
  const events = [{ type: "agent_call", record, runId: "child" }];
  const original = structuredClone(events);
  validate(events);
  expect(events).toEqual(original);
});

test("validation rejects malformed root and child conversation records", () => {
  for (const runId of [undefined, "child"]) {
    for (const field of Object.keys(record).filter(
      (field) => field !== "extra",
    )) {
      const malformed: Record<string, unknown> = { ...record };
      delete malformed[field];
      expect(() =>
        validate([{ type: "agent_call", runId, record: malformed }]),
      ).toThrow("Invalid conversation record");
    }
  }
});

test("validation rejects corrupt retention identifiers and summary records", () => {
  for (const event of [null, {}, { supersededRecordIds: [1] }]) {
    expect(() => validate([{ type: "conversation_retention", event }])).toThrow(
      "Invalid conversation retention event",
    );
  }
  expect(() =>
    validate([
      {
        type: "conversation_retention",
        event: { supersededRecordIds: ["record"], summaryRecord: {} },
      },
    ]),
  ).toThrow("Invalid conversation record");
});
