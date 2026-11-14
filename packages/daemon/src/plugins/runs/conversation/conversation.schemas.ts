import { z } from "zod/v4";
import { parseConversationJsonl } from "@comma-agents/core/conversation-context";
const ConversationRecordSchema = z.json().transform((value, context) => {
  try {
    return parseConversationJsonl(JSON.stringify(value))[0]!;
  } catch {
    context.addIssue({
      code: "custom",
      message: "Invalid conversation record",
    });
    return z.NEVER;
  }
});
const RetentionTriggerSchema = z
  .object({
    model: z.string().optional(),
    contextUsage: z
      .object({
        totalTokens: z.number(),
        inputTokens: z.number().optional(),
        outputTokens: z.number().optional(),
        inputTokenDetails: z
          .object({
            noCacheTokens: z.number().optional(),
            cacheReadTokens: z.number().optional(),
            cacheWriteTokens: z.number().optional(),
          })
          .optional(),
        outputTokenDetails: z
          .object({
            textTokens: z.number().optional(),
            reasoningTokens: z.number().optional(),
          })
          .optional(),
      })
      .optional(),
    tokenLimit: z.number().optional(),
    contextWindow: z.number().optional(),
    maxInputTokens: z.number().optional(),
    ratio: z.number().optional(),
    thresholdRatio: z.number().optional(),
    activeRecordCount: z.number().optional(),
    recordThreshold: z.number().optional(),
  })
  .strict();
export const RetentionEventSchema = z
  .object({
    id: z.string(),
    agentName: z.string(),
    createdAt: z.string(),
    kind: z.literal("compaction"),
    reason: z.enum(["context-window", "record-count"]),
    trigger: RetentionTriggerSchema,
    recordsCompacted: z.number().int().nonnegative(),
    recordsRetained: z.number().int().nonnegative(),
    summaryRecord: ConversationRecordSchema,
    supersededRecordIds: z.array(z.string()).readonly(),
    insertBeforeRecordId: z.string().optional(),
  })
  .strict();
export const ConversationEventSchema = z.discriminatedUnion("type", [
  z
    .object({ type: z.literal("agent_call"), record: ConversationRecordSchema })
    .strict(),
  z
    .object({
      type: z.literal("conversation_retention"),
      event: RetentionEventSchema,
    })
    .strict(),
]);
