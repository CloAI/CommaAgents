// Daemon → Client: pong
// Keepalive response.

import { z } from "zod";
import { DaemonBase } from "../shared";

export const PongMessage = DaemonBase.extend({
  type: z.literal("pong"),
});

export type PongMessage = z.infer<typeof PongMessage>;
