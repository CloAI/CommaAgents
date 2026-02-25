// Daemon → Client: flow_error
// Sent when a flow encounters an error.

import { z } from "zod";
import { DaemonBase, ErrorInfoSchema } from "../shared";

export const FlowErrorMessage = DaemonBase.extend({
  type: z.literal("flow_error"),
  /** The run ID that errored. */
  runId: z.string(),
  /** Structured error information. */
  error: ErrorInfoSchema,
});

export type FlowErrorMessage = z.infer<typeof FlowErrorMessage>;
