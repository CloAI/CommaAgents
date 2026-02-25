// Client → Daemon: subscribe
// Subscribe to events from a specific run.

import { z } from "zod";
import { ClientBase } from "../shared";

export const SubscribeMessage = ClientBase.extend({
  type: z.literal("subscribe"),
  /** The run ID to subscribe to. */
  runId: z.string().min(1),
});

export type SubscribeMessage = z.infer<typeof SubscribeMessage>;
