// Client → Daemon: trash_clear
// Clears all trash entries for one or all known workspaces.

import { z } from "zod";
import { ClientBase } from "../../shared";

export const TrashClearMessage = ClientBase.extend({
  type: z.literal("trash_clear"),
  cwd: z.string().optional(),
});

export type TrashClearMessage = z.infer<typeof TrashClearMessage>;
