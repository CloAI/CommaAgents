// Client → Daemon: trash_list
// Lists trash entries for one or all known workspaces.

import { z } from "zod";
import { ClientBase } from "../../shared";

export const TrashListMessage = ClientBase.extend({
  type: z.literal("trash_list"),
  cwd: z.string().optional(),
});

export type TrashListMessage = z.infer<typeof TrashListMessage>;
