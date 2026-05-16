// Load-session request handler.
// Returns the full session payload for a given session id.

import type { HandlerContext } from "../../dispatcher.types";
import type { LoadSessionMessage } from "./load-session.schema";

export { LoadSessionMessage } from "./load-session.schema";

/** Handle a `load_session` request. */
export async function handleLoadSession(
  message: LoadSessionMessage,
  context: HandlerContext<"load_session">,
): Promise<void> {
  const session = await context.sessionStore.load(message.sessionId);
  if (!session) {
    context.reply({
      type: "error" as const,
      code: "SESSION_NOT_FOUND",
      message: `Session not found: ${message.sessionId}`,
      ts: new Date().toISOString(),
      ...(message.requestId !== undefined
        ? { requestId: message.requestId }
        : {}),
    });
    return;
  }
  context.reply({
    type: "session_loaded" as const,
    metadata: { ...session.metadata },
    turns: session.turns.map((turn) => ({
      ...turn,
      responseMessages: [...turn.responseMessages],
    })),
    runs: session.runs.map((run) => ({ ...run })),
    ts: new Date().toISOString(),
    ...(message.requestId !== undefined
      ? { requestId: message.requestId }
      : {}),
  });
}
