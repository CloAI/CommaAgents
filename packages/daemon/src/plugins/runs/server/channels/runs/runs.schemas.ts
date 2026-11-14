import { DEFAULT_HISTORY_MESSAGE_LIMIT } from "../../../history/history.constants";
import { z } from "zod/v4";
import {
  RunSnapshotSchema,
  RunErrorSchema,
  HistoryOptionsSchema,
} from "../../server.schemas";
import {
  RunContentSchema,
  UserMessageSchema,
  FinishedAgentMessageSchema,
  ChildRunEntrySchema,
} from "../../../messages/messages.schemas";
import { RunHistoryPageSchema } from "../../../history/history.schemas";
export const RunsArgumentsSchema = z
  .object({
    runId: z.string().min(1),
    history: HistoryOptionsSchema.pick({ limit: true }).default({
      limit: DEFAULT_HISTORY_MESSAGE_LIMIT,
    }),
  })
  .strict();
const ExecutionSchema = z.object({ runId: z.string() });
export const ActiveRunAgentSchema = ExecutionSchema.extend({
  messageId: z.string(),
  agentName: z.string(),
  createdAt: z.string(),
}).strict();
export const PendingRunInputSchema = ExecutionSchema.extend({
  inputId: z.string(),
  agentName: z.string(),
  prompt: z.string(),
}).strict();
export const RunsMessageSchema = z.discriminatedUnion("type", [
  z
    .object({
      type: z.literal("run.initial"),
      data: z
        .object({
          snapshot: RunSnapshotSchema,
          history: RunHistoryPageSchema,
          pendingInputs: z.array(PendingRunInputSchema),
          activeAgents: z.array(ActiveRunAgentSchema).optional(),
        })
        .strict(),
    })
    .strict(),
  z.object({ type: z.literal("run.state"), data: RunSnapshotSchema }).strict(),
  z
    .object({ type: z.literal("agent.started"), data: ActiveRunAgentSchema })
    .strict(),
  z
    .object({
      type: z.literal("agent.stream"),
      data: ExecutionSchema.extend({
        messageId: z.string(),
        agentName: z.string(),
        createdAt: z.string(),
        model: z.string().optional(),
        contextWindow: z.number().optional(),
        contentIndex: z.number().int().nonnegative(),
        content: RunContentSchema,
      }).strict(),
    })
    .strict(),
  z
    .object({
      type: z.literal("agent.output"),
      data: FinishedAgentMessageSchema,
    })
    .strict(),
  z.object({ type: z.literal("user.input"), data: UserMessageSchema }).strict(),
  z
    .object({ type: z.literal("child.run"), data: ChildRunEntrySchema })
    .strict(),
  z
    .object({ type: z.literal("input.requested"), data: PendingRunInputSchema })
    .strict(),
  z
    .object({
      type: z.literal("input.resolved"),
      data: ExecutionSchema.extend({ inputId: z.string() }).strict(),
    })
    .strict(),
  z
    .object({
      type: z.literal("run.step"),
      data: ExecutionSchema.extend({
        phase: z.enum(["started", "completed"]),
        stepName: z.string(),
      }).strict(),
    })
    .strict(),
  z
    .object({
      type: z.literal("run.steer.queued"),
      data: ExecutionSchema.extend({ text: z.string() }).strict(),
    })
    .strict(),
  z
    .object({
      type: z.literal("run.error"),
      data: ExecutionSchema.extend({ error: RunErrorSchema }).strict(),
    })
    .strict(),
]);
