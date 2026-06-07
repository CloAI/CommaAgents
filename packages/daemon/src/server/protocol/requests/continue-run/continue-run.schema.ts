// Client -> Daemon: continue_run
// Restart a completed run's strategy with its conversation context restored.

import { z } from "zod";
import { ClientBase } from "../../shared";

export const ContinueRunMessage = ClientBase.extend({
  type: z.literal("continue_run"),
  /** The completed run whose strategy and conversation context should continue. */
  runId: z.string().min(1),
  /** New message passed into the restarted strategy flow. */
  input: z.string(),
  /** Optional strategy to execute with the previous run's conversation context. */
  strategyPath: z.string().min(1).optional(),
  /** Project manifest associated with the strategy override, when applicable. */
  manifestPath: z.string().min(1).optional(),
});

export type ContinueRunMessage = z.infer<typeof ContinueRunMessage>;
