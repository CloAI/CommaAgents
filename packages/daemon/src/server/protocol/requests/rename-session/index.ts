// Rename-session request handler.

import type { HandlerContext } from "../../dispatcher.types";
import type { RenameSessionMessage } from "./rename-session.schema";

export { RenameSessionMessage } from "./rename-session.schema";

/** Handle a `rename_session` request. */
export async function handleRenameSession(
  message: RenameSessionMessage,
  context: HandlerContext<"rename_session">,
): Promise<void> {
  try {
    const metadata = await context.sessionStore.rename(
      message.sessionId,
      message.title,
    );
    context.reply({
      type: "session_renamed" as const,
      metadata: { ...metadata },
      ts: new Date().toISOString(),
      ...(message.requestId !== undefined
        ? { requestId: message.requestId }
        : {}),
    });
  } catch (renameError) {
    context.reply({
      type: "error" as const,
      code: "SESSION_NOT_FOUND",
      message:
        renameError instanceof Error
          ? renameError.message
          : String(renameError),
      ts: new Date().toISOString(),
      ...(message.requestId !== undefined
        ? { requestId: message.requestId }
        : {}),
    });
  }
}
