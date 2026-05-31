// Client → Daemon: steer_run
// Queue a steering message to inject into a running strategy before its
// next agent turn.

import { z } from "zod";
import { ClientBase } from "../../shared";

export const SteerRunMessage = ClientBase.extend({
  type: z.literal("steer_run"),
  /** The run ID to steer. */
  runId: z.string().min(1),
  /** The steering text to inject before the next agent turn. */
  text: z.string().min(1),
});

export type SteerRunMessage = z.infer<typeof SteerRunMessage>;
