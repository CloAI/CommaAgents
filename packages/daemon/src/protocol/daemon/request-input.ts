// Daemon → Client: request_input
// Sent when a UserAgent is waiting for human input.

import { z } from "zod";
import { DaemonBase } from "../shared";

export const RequestInputMessage = DaemonBase.extend({
  type: z.literal("request_input"),
  /** The run ID that needs input. */
  runId: z.string(),
  /** The agent name that is waiting for input. */
  agentName: z.string(),
  /** Optional prompt to display to the user. */
  prompt: z.string().optional(),
});

export type RequestInputMessage = z.infer<typeof RequestInputMessage>;
