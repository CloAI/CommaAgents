// Client → Daemon: unsubscribe
// Unsubscribe from a run's events.

import { z } from "zod";
import { ClientBase } from "../shared";

export const UnsubscribeMessage = ClientBase.extend({
  type: z.literal("unsubscribe"),
  /** The run ID to unsubscribe from. */
  runId: z.string().min(1),
});

export type UnsubscribeMessage = z.infer<typeof UnsubscribeMessage>;
