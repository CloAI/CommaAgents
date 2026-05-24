import { z } from "zod";
import { DaemonBase } from "../../shared";

export const RunLoadedMessage = DaemonBase.extend({
  type: z.literal("run_loaded"),
  runId: z.string(),
  cwd: z.string(),
  strategyName: z.string(),
  strategyPath: z.string(),
  startedAt: z.string(),
  completedAt: z.string().nullable(),
  status: z.enum(["pending", "running", "completed", "error", "cancelled"]),
  error: z
    .object({
      code: z.string(),
      message: z.string(),
    })
    .optional(),
  /** Persisted turns — shape matches `RunTurn` from `runs/runs.types`. */
  turns: z.array(z.unknown()),
});

export type RunLoadedMessage = z.infer<typeof RunLoadedMessage>;
