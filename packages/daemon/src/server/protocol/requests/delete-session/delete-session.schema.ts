// Client → Daemon: delete_session
// Delete a saved session by id.

import { z } from "zod";
import { ClientBase } from "../../shared";

export const DeleteSessionMessage = ClientBase.extend({
  type: z.literal("delete_session"),
  sessionId: z.string(),
});

export type DeleteSessionMessage = z.infer<typeof DeleteSessionMessage>;
