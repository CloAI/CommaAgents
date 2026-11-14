import { StrategyStateSchema } from "../switching/switching.schemas";
import { FlowDefSchema } from "@comma-agents/core/strategy";
import type { RecordedRunFlow, RecordedRunFlowSchema } from "./state.types";
import { z } from "zod/v4";
import { RunConfigurationSchema } from "../preparation/preparation.schemas";
import { RunErrorCode } from "../errors";
export const RunErrorSchema = z.union([
  z
    .object({
      code: z.enum([
        RunErrorCode.RUN_NOT_FOUND,
        RunErrorCode.RUN_BUSY,
        RunErrorCode.INVALID_RUN_STATE,
      ]),
      metadata: z.object({ runId: z.string() }).strict(),
    })
    .strict(),
  z
    .object({
      code: z.literal(RunErrorCode.INPUT_NOT_FOUND),
      metadata: z.object({ runId: z.string(), inputId: z.string() }).strict(),
    })
    .strict(),
  z
    .object({
      code: z.enum([
        RunErrorCode.PREPARATION_ERROR,
        RunErrorCode.EXECUTION_ERROR,
        RunErrorCode.PERSISTENCE_ERROR,
      ]),
      message: z.string().optional(),
      metadata: z.object({ runId: z.string() }).strict(),
    })
    .strict(),
  z
    .object({
      code: z.literal(RunErrorCode.MISSING_MODEL_ROLES),
      metadata: z
        .object({ runId: z.string(), roles: z.array(z.string()).readonly() })
        .strict(),
    })
    .strict(),
  z
    .object({
      code: z.enum([
        RunErrorCode.INVALID_ARGUMENTS,
        RunErrorCode.INVALID_CURSOR,
      ]),
    })
    .strict(),
]);
/** Public lifecycle discriminators also used by private phase types. */
export enum RunPhase {
  preparing = "preparing",
  prepared = "prepared",
  running = "running",
  terminal = "terminal",
}
/** Terminal result categories; specific failure reasons belong to error codes. */
export enum RunOutcomeStatus {
  completed = "completed",
  stopped = "stopped",
  failed = "failed",
  interrupted = "interrupted",
}
export const RunResultSummarySchema = z
  .object({
    version: z.literal(1),
    text: z.string(),
    finishReason: z.string(),
    usage: z
      .object({ promptTokens: z.number(), completionTokens: z.number() })
      .strict(),
    data: z.json().optional(),
  })
  .strict();
export const RunCompletedOutcomeSchema = z
  .object({
    status: z.literal(RunOutcomeStatus.completed),
    summary: RunResultSummarySchema,
  })
  .strict();
export const RunStoppedOutcomeSchema = z
  .object({ status: z.literal(RunOutcomeStatus.stopped) })
  .strict();
export const RunFailedOutcomeSchema = z
  .object({ status: z.literal(RunOutcomeStatus.failed), error: RunErrorSchema })
  .strict();
export const RunInterruptedOutcomeSchema = z
  .object({ status: z.literal(RunOutcomeStatus.interrupted) })
  .strict();
export const RunTerminalOutcomeSchema = z.discriminatedUnion("status", [
  RunCompletedOutcomeSchema,
  RunStoppedOutcomeSchema,
  RunFailedOutcomeSchema,
  RunInterruptedOutcomeSchema,
]);
export const RunFlowSchema: RecordedRunFlowSchema = z
  .json()
  .transform((value, context): RecordedRunFlow => {
    const parsed = FlowDefSchema.safeParse(value);
    if (!parsed.success) {
      context.addIssue({ code: "custom", message: parsed.error.message });
      return z.NEVER;
    }
    // Core validates the recursive declaration; the JSON boundary excludes executable values.
    return parsed.data as RecordedRunFlow;
  });
export const RunStrategyDescriptionSchema = z
  .object({
    name: z.string(),
    agents: z.array(z.string()).readonly(),
    flow: RunFlowSchema,
  })
  .strict();
const RunSnapshotBaseSchema = z.object({
  runId: z.string().min(1),
  parentRunId: z.string().min(1).optional(),
  configuration: RunConfigurationSchema,
  strategyState: StrategyStateSchema.optional(),
});
export const RunPreparingSnapshotSchema = RunSnapshotBaseSchema.extend({
  phase: z.literal(RunPhase.preparing),
  strategy: RunStrategyDescriptionSchema.nullable(),
}).strict();
export const RunPreparedSnapshotSchema = RunSnapshotBaseSchema.extend({
  phase: z.literal(RunPhase.prepared),
  strategy: RunStrategyDescriptionSchema,
  unmatchedAgents: z.array(z.string()).readonly(),
}).strict();
export const RunRunningSnapshotSchema = RunSnapshotBaseSchema.extend({
  phase: z.literal(RunPhase.running),
  strategy: RunStrategyDescriptionSchema,
}).strict();
export const RunTerminalSnapshotSchema = RunSnapshotBaseSchema.extend({
  phase: z.literal(RunPhase.terminal),
  strategy: RunStrategyDescriptionSchema.nullable(),
  outcome: RunTerminalOutcomeSchema,
}).strict();
export const RunSnapshotSchema = z.discriminatedUnion("phase", [
  RunPreparingSnapshotSchema,
  RunPreparedSnapshotSchema,
  RunRunningSnapshotSchema,
  RunTerminalSnapshotSchema,
]);
