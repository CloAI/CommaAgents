// Client → Daemon: user_input
// Respond to a request_input prompt from a UserAgent.

import { z } from "zod";
import { ClientBase } from "../../shared";

export const UserInputMessage = ClientBase.extend({
  type: z.literal("user_input"),
  /** The run ID this input is for. */
  runId: z.string().min(1),
  /** The agent name that requested input. */
  agentName: z.string().min(1),
  /** The user's text response. */
  text: z.string(),
});

export type UserInputMessage = z.infer<typeof UserInputMessage>;
