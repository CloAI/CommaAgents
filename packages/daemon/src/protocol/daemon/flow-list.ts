// Daemon → Client: flow_list
// Response to a list_flows request.

import { z } from "zod";
import { DaemonBase, RunSummarySchema } from "../shared";

export const FlowListMessage = DaemonBase.extend({
  type: z.literal("flow_list"),
  /** Array of run summaries. */
  runs: z.array(RunSummarySchema),
});

export type FlowListMessage = z.infer<typeof FlowListMessage>;
