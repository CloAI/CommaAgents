import { restoreFromTrash } from "@comma-agents/core";
import type { HandlerContext } from "../../dispatcher.types";
import type { TrashRestoreMessage } from "./trash-restore.schema";

export { TrashRestoreMessage } from "./trash-restore.schema";

export async function handleTrashRestore(
  message: TrashRestoreMessage,
  context: HandlerContext<"trash_restore">,
): Promise<void> {
  try {
    const restoredPath = await restoreFromTrash(
      message.cwd,
      message.trashPath,
      message.targetPath,
    );

    context.reply({
      type: "trash_restore_result" as const,
      restored: restoredPath,
      from: message.trashPath,
      ts: new Date().toISOString(),
      ...(message.requestId !== undefined
        ? { requestId: message.requestId }
        : {}),
    });
  } catch (caughtError) {
    const errorMessage =
      caughtError instanceof Error ? caughtError.message : String(caughtError);
    context.reply({
      type: "error" as const,
      code: "RESTORE_FAILED",
      message: errorMessage,
      ts: new Date().toISOString(),
      ...(message.requestId !== undefined
        ? { requestId: message.requestId }
        : {}),
    });
  }
}
