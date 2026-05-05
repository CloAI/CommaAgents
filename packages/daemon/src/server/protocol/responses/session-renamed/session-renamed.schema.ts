// Daemon → Client: session_renamed
// Response to a rename_session request — returns updated metadata.

import { z } from "zod";
import { DaemonBase } from "../../shared";
import { SessionMetadataSchema } from "../session-list/session-list.schema";

export const SessionRenamedMessage = DaemonBase.extend({
  type: z.literal("session_renamed"),
  metadata: SessionMetadataSchema,
});

export type SessionRenamedMessage = z.infer<typeof SessionRenamedMessage>;
