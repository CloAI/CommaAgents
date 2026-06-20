// Shared response schemas — reusable Zod schemas used by multiple
// daemon → client response types.

import { z } from "zod";

/** Token usage summary. Mirrors core AgentCallResult.usage. */
export const UsageSchema = z.object({
  promptTokens: z.number(),
  completionTokens: z.number(),
});
export type Usage = z.infer<typeof UsageSchema>;

export const ContextUsageSchema = z.object({
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
});
export type ContextUsageWire = z.infer<typeof ContextUsageSchema>;

export const UserModelMessageSchema = z
  .object({
    role: z.literal("user"),
    content: z.unknown(),
  })
  .passthrough();

export const ResponseMessageSchema = z
  .object({
    role: z.enum(["assistant", "tool"]),
    content: z.unknown(),
  })
  .passthrough();

export const ConversationRecordSchema = z.object({
  id: z.string(),
  agentName: z.string(),
  createdAt: z.string(),
  userMessage: UserModelMessageSchema,
  responseMessages: z.array(ResponseMessageSchema),
  text: z.string(),
  usage: UsageSchema,
  contextUsage: ContextUsageSchema.optional(),
  finishReason: z.string(),
  status: z.enum(["active", "superseded"]).optional(),
  supersededBy: z.string().optional(),
});
export type ConversationRecordWire = z.infer<typeof ConversationRecordSchema>;

export const ConversationRetentionEventSchema = z.object({
  id: z.string(),
  agentName: z.string(),
  createdAt: z.string(),
  kind: z.literal("compaction"),
  reason: z.enum(["context-window", "record-count"]),
  trigger: z.object({
    model: z.string().optional(),
    contextUsage: ContextUsageSchema.optional(),
    tokenLimit: z.number().optional(),
    contextWindow: z.number().optional(),
    maxInputTokens: z.number().optional(),
    ratio: z.number().optional(),
    thresholdRatio: z.number().optional(),
    activeRecordCount: z.number().optional(),
    recordThreshold: z.number().optional(),
  }),
  recordsCompacted: z.number(),
  recordsRetained: z.number(),
  summaryRecord: ConversationRecordSchema,
  supersededRecordIds: z.array(z.string()),
  insertBeforeRecordId: z.string().optional(),
});
export type ConversationRetentionEventWire = z.infer<
  typeof ConversationRetentionEventSchema
>;

export const ConversationInputSchema = z.object({
  text: z.string(),
  beforeRecordId: z.string().optional(),
});
export type ConversationInputWire = z.infer<typeof ConversationInputSchema>;

export const ConversationHistorySchema = z.object({
  records: z.array(ConversationRecordSchema),
  retentionEvents: z.array(ConversationRetentionEventSchema).default([]),
  inputs: z.array(ConversationInputSchema).default([]),
});
export type ConversationHistoryWire = z.infer<typeof ConversationHistorySchema>;

/**
 * Serialized AgentCallResult — the subset we send over the wire.
 * Omits `steps` (internal detail) and sends only the fields
 * clients actually need.
 */
export const AgentCallResultSchema = z.object({
  text: z.string(),
  usage: UsageSchema,
  /** Tokens occupying the final model step's context window. */
  contextUsage: ContextUsageSchema.optional(),
  finishReason: z.string(),
});
export type AgentCallResultWire = z.infer<typeof AgentCallResultSchema>;
