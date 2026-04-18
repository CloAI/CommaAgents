// Daemon → Client: strategy_list
// Response to a list_strategies request.

import { z } from "zod";
import { DaemonBase } from "../../shared";

/** Summary of a running or completed strategy, used in strategy_list responses. */
export const RunSummarySchema = z.object({
  runId: z.string(),
  strategyName: z.string(),
  status: z.enum(["pending", "running", "completed", "error", "cancelled"]),
  startedAt: z.string().datetime(),
  completedAt: z.string().datetime().optional(),
});
export type RunSummary = z.infer<typeof RunSummarySchema>;

export const StrategyListMessage = DaemonBase.extend({
  type: z.literal("strategy_list"),
  /** Array of run summaries. */
  runs: z.array(RunSummarySchema),
});

export type StrategyListMessage = z.infer<typeof StrategyListMessage>;
