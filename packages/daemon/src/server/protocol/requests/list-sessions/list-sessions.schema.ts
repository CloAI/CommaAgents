// Client → Daemon: list_sessions
// Returns metadata for saved sessions, optionally filtered by cwd.

import { z } from "zod";
import { ClientBase } from "../../shared";

export const ListSessionsMessage = ClientBase.extend({
  type: z.literal("list_sessions"),
  /** When provided, only sessions for this cwd are returned. */
  cwd: z.string().optional(),
});

export type ListSessionsMessage = z.infer<typeof ListSessionsMessage>;
