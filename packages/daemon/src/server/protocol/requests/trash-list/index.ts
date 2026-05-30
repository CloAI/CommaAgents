import { listTrash } from "@comma-agents/core";
import type { HandlerContext } from "../../dispatcher.types";
import type { TrashListMessage } from "./trash-list.schema";

export { TrashListMessage } from "./trash-list.schema";

export async function handleTrashList(
  message: TrashListMessage,
  context: HandlerContext<"trash_list">,
): Promise<void> {
  const cwd = message.cwd ?? process.cwd();
  const entries = await listTrash(cwd);

  const workspaces =
    entries.length > 0
      ? [
          {
            cwd,
            trashDir: "", // not needed on wire — the entries have absolute paths
            entries: entries.map((entry) => ({
              path: entry.path,
              metadata: entry.metadata,
              sizeBytes: entry.sizeBytes,
            })),
          },
        ]
      : [];

  const totalEntries = entries.length;
  const totalBytes = entries.reduce((sum, entry) => sum + entry.sizeBytes, 0);

  context.reply({
    type: "trash_list_result" as const,
    workspaces,
    totalEntries,
    totalBytes,
    ts: new Date().toISOString(),
    ...(message.requestId !== undefined
      ? { requestId: message.requestId }
      : {}),
  });
}
