// Daemon → Client: session_list
// Response to a list_sessions request.

import { z } from "zod";
import { DaemonBase } from "../../shared";

/** Wire-safe session metadata used in session_list / session_renamed responses. */
export const SessionMetadataSchema = z.object({
  id: z.string(),
  cwd: z.string(),
  cwdHash: z.string(),
  title: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
  schemaVersion: z.number().int(),
});
export type SessionMetadataWire = z.infer<typeof SessionMetadataSchema>;

export const SessionListMessage = DaemonBase.extend({
  type: z.literal("session_list"),
  /** Sessions matching the request's filter, ordered by `updatedAt` desc. */
  sessions: z.array(SessionMetadataSchema),
});

export type SessionListMessage = z.infer<typeof SessionListMessage>;
