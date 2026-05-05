// Client → Daemon: load_session
// Load a single session by id.

import { z } from "zod";
import { ClientBase } from "../../shared";

export const LoadSessionMessage = ClientBase.extend({
  type: z.literal("load_session"),
  sessionId: z.string(),
});

export type LoadSessionMessage = z.infer<typeof LoadSessionMessage>;
