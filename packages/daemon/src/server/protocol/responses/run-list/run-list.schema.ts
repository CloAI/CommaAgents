import { z } from "zod";
import { DaemonBase } from "../../shared";

export const RunOverviewSchema = z.object({
  runId: z.string(),
  cwd: z.string(),
  strategyName: z.string(),
  strategyPath: z.string(),
  startedAt: z.string(),
  completedAt: z.string().nullable(),
  status: z.enum(["pending", "running", "completed", "error", "cancelled"]),
});
export type RunOverviewWire = z.infer<typeof RunOverviewSchema>;

export const RunListMessage = DaemonBase.extend({
  type: z.literal("run_list"),
  /** Run summaries, ordered by `startedAt` descending. */
  runs: z.array(RunOverviewSchema),
});

export type RunListMessage = z.infer<typeof RunListMessage>;
