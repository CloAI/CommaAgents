// Daemon → Client: session_deleted
// Response to a delete_session request.

import { z } from "zod";
import { DaemonBase } from "../../shared";

export const SessionDeletedMessage = DaemonBase.extend({
  type: z.literal("session_deleted"),
  /** The session id the client requested to delete. */
  sessionId: z.string(),
  /** True if the session existed and was removed; false if not found. */
  deleted: z.boolean(),
});

export type SessionDeletedMessage = z.infer<typeof SessionDeletedMessage>;
