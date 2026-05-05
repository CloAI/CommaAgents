// Client → Daemon: rename_session
// Set a session's title. Pass null to reset the title to the session id.

import { z } from "zod";
import { ClientBase } from "../../shared";

export const RenameSessionMessage = ClientBase.extend({
  type: z.literal("rename_session"),
  sessionId: z.string(),
  /** New title; pass `null` to reset to the session id. */
  title: z.string().nullable(),
});

export type RenameSessionMessage = z.infer<typeof RenameSessionMessage>;
