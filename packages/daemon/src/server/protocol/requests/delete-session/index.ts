// Delete-session request handler.

import type { HandlerContext } from "../../dispatcher.types";
import type { DeleteSessionMessage } from "./delete-session.schema";

export { DeleteSessionMessage } from "./delete-session.schema";

/** Handle a `delete_session` request. */
export async function handleDeleteSession(
  message: DeleteSessionMessage,
  context: HandlerContext<"delete_session">,
): Promise<void> {
  const deleted = await context.sessionStore.delete(message.sessionId);
  context.reply({
    type: "session_deleted" as const,
    sessionId: message.sessionId,
    deleted,
    ts: new Date().toISOString(),
    ...(message.requestId !== undefined ? { requestId: message.requestId } : {}),
  });
}
