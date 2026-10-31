import { StrategyChangeSchema } from "../switching/switching.schemas";
import { RunErrorCode } from "../errors";
import { z } from "zod/v4";
import { RunOutcomeStatus, RunPhase } from "../state/state.schemas";
/** Lifecycle of a displayed agent invocation. */
export enum RunMessageStatus {
  streaming = "streaming",
  completed = "completed",
  stopped = "stopped",
  failed = "failed",
}
/** Lifecycle of a tool block within one invocation. */
export enum RunToolStatus {
  running = "running",
  completed = "completed",
  stopped = "stopped",
  failed = "failed",
}
export const TextContentSchema = z
  .object({ type: z.literal("text"), text: z.string() })
  .strict();
export const ReasoningContentSchema = z
  .object({ type: z.literal("reasoning"), text: z.string() })
  .strict();
const ToolBaseSchema = z.object({
  cancellationRequestedBy: z.literal("user_steering").optional(),
  cancellationReason: z.literal("user_steering").optional(),
  type: z.literal("tool"),
  toolCallId: z.string(),
  toolName: z.string(),
  arguments: z.json(),
  mcp: z
    .object({ serverId: z.string(), toolName: z.string() })
    .strict()
    .optional(),
});
export const RunningToolContentSchema = ToolBaseSchema.extend({
  status: z.literal(RunToolStatus.running),
}).strict();
export const CompletedToolContentSchema = ToolBaseSchema.extend({
  status: z.literal(RunToolStatus.completed),
  output: z.json(),
}).strict();
export const FailedToolContentSchema = ToolBaseSchema.extend({
  status: z.literal(RunToolStatus.failed),
  output: z.json(),
  error: z
    .object({ code: z.literal(RunErrorCode.TOOL_EXECUTION_ERROR) })
    .strict(),
}).strict();
export const StoppedToolContentSchema = ToolBaseSchema.extend({
  status: z.literal(RunToolStatus.stopped),
}).strict();
export const ToolContentSchema = z.discriminatedUnion("status", [
  RunningToolContentSchema,
  CompletedToolContentSchema,
  FailedToolContentSchema,
  StoppedToolContentSchema,
]);
export const RunContentSchema = z.union([
  TextContentSchema,
  ReasoningContentSchema,
  ToolContentSchema,
]);
const MessageBaseSchema = z.object({
  type: z.literal("message"),
  messageId: z.string(),
  runId: z.string(),
  parentRunId: z.string().optional(),
  createdAt: z.string(),
});
export const UserMessageSchema = MessageBaseSchema.extend({
  role: z.literal("user"),
  status: z.literal(RunMessageStatus.completed),
  content: z.array(TextContentSchema).readonly(),
}).strict();
export const UsageSchema = z
  .object({ promptTokens: z.number(), completionTokens: z.number() })
  .strict();
export const ContextUsageSchema = z
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
  .strict();
const AgentMessageBaseSchema = MessageBaseSchema.extend({
  cancellationReason: z.literal("user_steering").optional(),
  role: z.literal("agent"),
  agentName: z.string(),
  model: z.string().optional(),
  contextWindow: z.number().optional(),
  content: z.array(RunContentSchema).readonly(),
});
export const StreamingAgentMessageSchema = AgentMessageBaseSchema.extend({
  status: z.literal(RunMessageStatus.streaming),
}).strict();
export const CompletedAgentMessageSchema = AgentMessageBaseSchema.extend({
  status: z.literal(RunMessageStatus.completed),
  completedAt: z.string().optional(),
  usage: UsageSchema.optional(),
  contextUsage: ContextUsageSchema.optional(),
}).strict();
export const StoppedAgentMessageSchema = AgentMessageBaseSchema.extend({
  status: z.literal(RunMessageStatus.stopped),
  completedAt: z.string().optional(),
}).strict();
export const FailedAgentMessageSchema = AgentMessageBaseSchema.extend({
  status: z.literal(RunMessageStatus.failed),
  completedAt: z.string().optional(),
}).strict();
export const FinishedAgentMessageSchema = z.discriminatedUnion("status", [
  CompletedAgentMessageSchema,
  StoppedAgentMessageSchema,
  FailedAgentMessageSchema,
]);
export const RunMessageSchema = z.union([
  UserMessageSchema,
  FinishedAgentMessageSchema,
]);
const ChildRunBaseSchema = z.object({
  type: z.literal("child.run"),
  messageId: z.string(),
  runId: z.string(),
  childRunId: z.string(),
  strategyName: z.string(),
  createdAt: z.string(),
  sourceMessageId: z.string().optional(),
  toolCallId: z.string().optional(),
});
export const ActiveChildRunEntrySchema = ChildRunBaseSchema.extend({
  phase: z.enum([RunPhase.preparing, RunPhase.prepared, RunPhase.running]),
}).strict();
export const TerminalChildRunEntrySchema = ChildRunBaseSchema.extend({
  phase: z.literal(RunPhase.terminal),
  outcome: z.enum(RunOutcomeStatus),
}).strict();
export const ChildRunEntrySchema = z.union([
  ActiveChildRunEntrySchema,
  TerminalChildRunEntrySchema,
]);
export const RunHistoryEntrySchema = z.union([
  StrategyChangeSchema,
  RunMessageSchema,
  ChildRunEntrySchema,
]);
