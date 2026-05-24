// Client → Daemon: trash_restore
// Restores a file from a trash archive.

import { z } from "zod";
import { ClientBase } from "../../shared";

export const TrashRestoreMessage = ClientBase.extend({
  type: z.literal("trash_restore"),
  cwd: z.string().min(1),
  trashPath: z.string().min(1),
  targetPath: z.string().optional(),
});

export type TrashRestoreMessage = z.infer<typeof TrashRestoreMessage>;
