// Daemon → Client: steer_queued
// Acknowledges that a steering message has been queued for a run. The TUI
// renders the text as a pending user message in the transcript.

import { z } from "zod";
import { DaemonBase } from "../../shared";

export const SteerQueuedMessage = DaemonBase.extend({
  type: z.literal("steer_queued"),
  /** The run ID the steering message was queued for. */
  runId: z.string(),
  /** The steering text that was queued. */
  text: z.string(),
});

export type SteerQueuedMessage = z.infer<typeof SteerQueuedMessage>;
