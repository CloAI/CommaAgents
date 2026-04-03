// Daemon → Client: flow_list
// Response to a list_flows request.

import { z } from "zod";
import { DaemonBase } from "../../shared";

/** Summary of a running or completed flow, used in flow_list responses. */
export const RunSummarySchema = z.object({
  runId: z.string(),
  strategyName: z.string(),
  status: z.enum(["pending", "running", "completed", "error", "cancelled"]),
  startedAt: z.string().datetime(),
  completedAt: z.string().datetime().optional(),
});
export type RunSummary = z.infer<typeof RunSummarySchema>;

export const FlowListMessage = DaemonBase.extend({
  type: z.literal("flow_list"),
  /** Array of run summaries. */
  runs: z.array(RunSummarySchema),
});

export type FlowListMessage = z.infer<typeof FlowListMessage>;
