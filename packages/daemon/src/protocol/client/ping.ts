// Client → Daemon: ping
// Keepalive message.

import { z } from "zod";
import { ClientBase } from "../shared";

export const PingMessage = ClientBase.extend({
  type: z.literal("ping"),
});

export type PingMessage = z.infer<typeof PingMessage>;
