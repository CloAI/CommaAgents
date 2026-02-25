// Daemon → Client: step_started
// Sent when a flow step begins execution.

import { z } from "zod";
import { DaemonBase } from "../shared";

export const StepStartedMessage = DaemonBase.extend({
  type: z.literal("step_started"),
  /** The run ID this step belongs to. */
  runId: z.string(),
  /** Name of the step (agent or nested flow). */
  stepName: z.string(),
  /** The message being passed to this step. */
  message: z.string(),
});

export type StepStartedMessage = z.infer<typeof StepStartedMessage>;
