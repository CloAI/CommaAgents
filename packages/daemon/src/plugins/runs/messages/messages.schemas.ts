import { z } from "zod/v4";

export const TextContentSchema = z
  .object({ type: z.literal("text"), text: z.string() })
  .strict();
export const ReasoningContentSchema = z
  .object({ type: z.literal("reasoning"), text: z.string() })
  .strict();
export const ToolContentSchema = z
  .object({
    type: z.literal("tool"),
    toolCallId: z.string(),
    toolName: z.string(),
    arguments: z.json(),
    status: z.enum(["running", "completed", "error", "cancelled"]),
    output: z.json().optional(),
    error: z.string().optional(),
    mcp: z.object({ serverId: z.string(), toolName: z.string() }).optional(),
  })
  .strict();
export const RunContentSchema = z.discriminatedUnion("type", [
  TextContentSchema,
  ReasoningContentSchema,
  ToolContentSchema,
]);
export const RunMessageSchema = z
  .object({
    type: z.literal("message"),
    messageId: z.string(),
    runId: z.string(),
    parentRunId: z.string().optional(),
    role: z.enum(["user", "agent"]),
    agentName: z.string().optional(),
    createdAt: z.string(),
    status: z.enum(["streaming", "completed", "cancelled", "failed"]),
    content: z.array(RunContentSchema).readonly(),
  })
  .strict();
export const ChildRunEntrySchema = z
  .object({
    type: z.literal("child.run"),
    messageId: z.string(),
    runId: z.string(),
    childRunId: z.string(),
    strategyName: z.string(),
    createdAt: z.string(),
    sourceMessageId: z.string().optional(),
    toolCallId: z.string().optional(),
    phase: z.enum(["preparing", "prepared", "running", "terminal"]),
    outcome: z
      .enum([
        "completed",
        "failed",
        "cancelled",
        "interrupted",
        "persistence_error",
      ])
      .optional(),
  })
  .strict();
export const RunHistoryEntrySchema = z.discriminatedUnion("type", [
  RunMessageSchema,
  ChildRunEntrySchema,
]);
