// Client → Daemon: continue_run
// Continue a finished run with a new prompt, optionally switching strategy.
// Replays the run's prior agent turns to rehydrate context, then drives the
// (possibly different) strategy flow with the new input.

import { z } from "zod";
import { ClientBase } from "../../shared";

export const ContinueRunMessage = ClientBase.extend({
  type: z.literal("continue_run"),
  /** The run ID to continue. */
  runId: z.string().min(1),
  /** The new prompt to drive the continued flow. */
  input: z.string().min(1),
  /** Optional strategy path to switch to for the continuation. */
  strategyPath: z.string().min(1).optional(),
  /** Optional model override for agents during this continuation. */
  modelOverride: z.string().min(1).optional(),
});

export type ContinueRunMessage = z.infer<typeof ContinueRunMessage>;
