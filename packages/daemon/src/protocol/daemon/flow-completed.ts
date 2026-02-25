// Daemon → Client: flow_completed
// Sent when a flow finishes successfully.

import { z } from "zod";
import { DaemonBase, UsageSchema } from "../shared";

export const FlowCompletedMessage = DaemonBase.extend({
  type: z.literal("flow_completed"),
  /** The run ID that completed. */
  runId: z.string(),
  /** The final text output of the flow. */
  result: z.string(),
  /** Aggregated token usage across all steps. */
  usage: UsageSchema,
});

export type FlowCompletedMessage = z.infer<typeof FlowCompletedMessage>;
