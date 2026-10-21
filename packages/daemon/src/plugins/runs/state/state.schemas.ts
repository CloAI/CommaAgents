import { z } from "zod/v4";
export const RunErrorSchema = z
  .object({ code: z.string(), message: z.string() })
  .strict();
const SummarySchema = z.object({
  version: z.literal(1),
  text: z.string(),
  finishReason: z.string(),
  usage: z.object({ promptTokens: z.number(), completionTokens: z.number() }),
  data: z.unknown().optional(),
});
export const StoredRunSnapshotSchema = z.object({
  runId: z.string(),
  parentRunId: z.string().optional(),
  phase: z.enum(["preparing", "prepared", "running", "terminal"]),
  strategyPath: z.string(),
  strategyName: z.string().optional(),
  cwd: z.string(),
  mode: z.enum(["new", "continuation"]),
  outcome: z
    .discriminatedUnion("status", [
      z.object({ status: z.literal("completed"), summary: SummarySchema }),
      z.object({
        status: z.enum([
          "failed",
          "cancelled",
          "persistence_error",
          "interrupted",
        ]),
        error: RunErrorSchema.optional(),
        summary: SummarySchema.optional(),
      }),
    ])
    .optional(),
});
export const RunSnapshotSchema = StoredRunSnapshotSchema.extend({
  agents: z.array(z.string()).readonly().optional(),
  flowTree: z.unknown().optional(),
  unmatchedAgents: z.array(z.string()).readonly().optional(),
});
