// Client → Daemon: start_flow
// Start a strategy execution by file path.

import { z } from "zod";
import { ClientBase } from "../shared";

export const StartFlowMessage = ClientBase.extend({
  type: z.literal("start_flow"),
  /** Path to the strategy JSON/YAML file. */
  strategyPath: z.string().min(1),
  /** Optional initial input message for the flow. */
  input: z.string().optional(),
});

export type StartFlowMessage = z.infer<typeof StartFlowMessage>;
