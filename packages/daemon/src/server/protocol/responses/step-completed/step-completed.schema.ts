// Daemon → Client: step_completed
// Sent when a flow step finishes execution.

import { z } from "zod";
import { DaemonBase } from "../../shared";
import { AgentCallResultSchema } from "../shared";

export const StepCompletedMessage = DaemonBase.extend({
  type: z.literal("step_completed"),
  /** The run ID this step belongs to. */
  runId: z.string(),
  /** Name of the step that completed. */
  stepName: z.string(),
  /** The step's result. */
  result: AgentCallResultSchema,
});

export type StepCompletedMessage = z.infer<typeof StepCompletedMessage>;
