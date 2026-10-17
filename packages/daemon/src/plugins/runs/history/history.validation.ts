import { z } from "zod";
import type { TimelineEvent } from "@comma-agents/core";

// These boundaries retain the existing persisted-record acceptance rules.
const objectSchema = z.custom<object>(
  (value) => value !== null && typeof value === "object",
);
const conversationRecordSchema = z.object({
  id: z.string(),
  agentName: z.string(),
  createdAt: z.string(),
  userMessage: objectSchema,
  responseMessages: z.array(z.unknown()),
  text: z.string(),
  usage: objectSchema,
  finishReason: z.string(),
});
const retentionIdsSchema = z.object({
  supersededRecordIds: z.array(z.string()),
});

/**
 * Validate persisted conversation records without modifying the timeline.
 * @param {readonly TimelineEvent[]} events - Timeline records to validate.
 * @returns {void} Nothing when persisted conversation records are valid.
 * @internal
 */
export function validateRunTimeline(events: readonly TimelineEvent[]): void {
  for (const event of events) {
    if (event.type === "conversation_retention") {
      if (!retentionIdsSchema.safeParse(event.event).success) {
        throw new Error("Invalid conversation retention event in run timeline");
      }
    }
    if (
      event.type === "agent_call" ||
      event.type === "conversation_retention"
    ) {
      const record =
        event.type === "agent_call" ? event.record : event.event.summaryRecord;
      if (!conversationRecordSchema.safeParse(record).success) {
        throw new Error("Invalid conversation record in run timeline");
      }
    }
  }
}
