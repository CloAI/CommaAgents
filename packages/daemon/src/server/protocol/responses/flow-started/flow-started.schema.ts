// Daemon → Client: flow_started
// Sent when a flow execution begins.

import { z } from "zod";
import { DaemonBase } from "../../shared";

export const FlowStartedMessage = DaemonBase.extend({
  type: z.literal("flow_started"),
  /** Unique identifier for this run. */
  runId: z.string(),
  /** Name of the strategy being executed. */
  strategyName: z.string(),
  /** List of agent names in the strategy. */
  agents: z.array(z.string()),
  /** Serialized flow tree structure for UI rendering. */
  flowTree: z.record(z.unknown()),
});

export type FlowStartedMessage = z.infer<typeof FlowStartedMessage>;
