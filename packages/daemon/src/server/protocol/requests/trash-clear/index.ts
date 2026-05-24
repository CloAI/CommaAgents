import { clearTrash } from "@comma-agents/core";
import type { HandlerContext } from "../../dispatcher.types";
import type { TrashClearMessage } from "./trash-clear.schema";

export { TrashClearMessage } from "./trash-clear.schema";

export async function handleTrashClear(
  message: TrashClearMessage,
  context: HandlerContext<"trash_clear">,
): Promise<void> {
  const cwd = message.cwd ?? process.cwd();
  const result = await clearTrash(cwd);

  context.reply({
    type: "trash_clear_result" as const,
    cleared: result.cleared,
    bytesFreed: result.bytesFreed,
    ts: new Date().toISOString(),
    ...(message.requestId !== undefined
      ? { requestId: message.requestId }
      : {}),
  });
}
