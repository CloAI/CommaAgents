// List-sessions request handler.
// Returns persisted session metadata; optionally filtered by cwd.

import type { HandlerContext } from "../../dispatcher.types";
import type { ListSessionsMessage } from "./list-sessions.schema";

export { ListSessionsMessage } from "./list-sessions.schema";

/** Handle a `list_sessions` request. */
export async function handleListSessions(
  message: ListSessionsMessage,
  context: HandlerContext<"list_sessions">,
): Promise<void> {
  const filter = message.cwd !== undefined ? { cwd: message.cwd } : undefined;
  const sessions = await context.sessionStore.list(filter);
  context.reply({
    type: "session_list" as const,
    sessions: sessions.map((session) => ({ ...session })),
    ts: new Date().toISOString(),
    ...(message.requestId !== undefined
      ? { requestId: message.requestId }
      : {}),
  });
}
