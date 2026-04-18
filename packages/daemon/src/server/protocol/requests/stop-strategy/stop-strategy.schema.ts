// Client → Daemon: stop_strategy
// Cancel a running strategy by its run ID.

import { z } from "zod";
import { ClientBase } from "../../shared";

export const StopStrategyMessage = ClientBase.extend({
  type: z.literal("stop_strategy"),
  /** The run ID of the strategy to cancel. */
  runId: z.string().min(1),
});

export type StopStrategyMessage = z.infer<typeof StopStrategyMessage>;
