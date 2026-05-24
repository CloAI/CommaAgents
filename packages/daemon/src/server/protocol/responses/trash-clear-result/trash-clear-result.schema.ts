// Daemon → Client: trash_clear_result
// Response to a trash_clear request.

import { z } from "zod";
import { DaemonBase } from "../../shared";

export const TrashClearResultMessage = DaemonBase.extend({
  type: z.literal("trash_clear_result"),
  cleared: z.number().int(),
  bytesFreed: z.number().int(),
});

export type TrashClearResultMessage = z.infer<typeof TrashClearResultMessage>;
