// Daemon → Client: trash_restore_result
// Response to a trash_restore request.

import { z } from "zod";
import { DaemonBase } from "../../shared";

export const TrashRestoreResultMessage = DaemonBase.extend({
  type: z.literal("trash_restore_result"),
  restored: z.string(),
  from: z.string(),
});

export type TrashRestoreResultMessage = z.infer<
  typeof TrashRestoreResultMessage
>;
