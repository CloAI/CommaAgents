// Client → Daemon: stop_flow
// Cancel a running flow by its run ID.

import { z } from "zod";
import { ClientBase } from "../../shared";

export const StopFlowMessage = ClientBase.extend({
  type: z.literal("stop_flow"),
  /** The run ID of the flow to cancel. */
  runId: z.string().min(1),
});

export type StopFlowMessage = z.infer<typeof StopFlowMessage>;
