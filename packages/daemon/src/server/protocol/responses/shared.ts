// Shared response schemas — reusable Zod schemas used by multiple
// daemon → client response types.

import { z } from "zod";

/** Token usage summary. Mirrors core AgentCallResult.usage. */
export const UsageSchema = z.object({
  promptTokens: z.number(),
  completionTokens: z.number(),
});
export type Usage = z.infer<typeof UsageSchema>;

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
  contextTokens: z.number().optional(),
  finishReason: z.string(),
});
export type ConversationRecordWire = z.infer<typeof ConversationRecordSchema>;

export const ConversationHistorySchema = z.object({
  records: z.array(ConversationRecordSchema),
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
  contextTokens: z.number().optional(),
  finishReason: z.string(),
});
export type AgentCallResultWire = z.infer<typeof AgentCallResultSchema>;
