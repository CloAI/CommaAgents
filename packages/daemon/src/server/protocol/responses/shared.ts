// Shared response schemas — reusable Zod schemas used by multiple
// daemon → client response types.

import { z } from "zod";

/** Token usage summary. Mirrors core AgentCallResult.usage. */
export const UsageSchema = z.object({
  promptTokens: z.number(),
  completionTokens: z.number(),
});
export type Usage = z.infer<typeof UsageSchema>;

/**
 * Serialized AgentCallResult — the subset we send over the wire.
 * We intentionally omit `steps` (complex AI SDK internals) and send
 * only the fields clients actually need.
 */
export const AgentCallResultSchema = z.object({
  text: z.string(),
  usage: UsageSchema,
  finishReason: z.string(),
});
export type AgentCallResultWire = z.infer<typeof AgentCallResultSchema>;
