// Client → Daemon: list_runs
// Returns run summaries, optionally filtered by cwd.

import { z } from "zod";
import { ClientBase } from "../../shared";

export const ListRunsMessage = ClientBase.extend({
  type: z.literal("list_runs"),
  /** When provided, only runs matching this cwd are returned. */
  cwd: z.string().optional(),
});

export type ListRunsMessage = z.infer<typeof ListRunsMessage>;
