// Daemon → Client: strategy_completed
// Sent when a strategy finishes successfully.

import { z } from "zod";
import { DaemonBase } from "../../shared";
import { UsageSchema } from "../shared";

export const StrategyCompletedMessage = DaemonBase.extend({
  type: z.literal("strategy_completed"),
  /** The run ID that completed. */
  runId: z.string(),
  /** The final text output of the strategy. */
  result: z.string(),
  /** Aggregated token usage across all steps. */
  usage: UsageSchema,
});

export type StrategyCompletedMessage = z.infer<typeof StrategyCompletedMessage>;
