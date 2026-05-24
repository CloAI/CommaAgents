// Daemon → Client: trash_list_result
// Response to a trash_list request.

import { z } from "zod";
import { DaemonBase } from "../../shared";

export const TrashEntryMetadataSchema = z.object({
  trashedAt: z.string(),
  originalPath: z.string(),
  originalSha256: z.string(),
  sessionId: z.string().optional(),
  runId: z.string().optional(),
  agentName: z.string().optional(),
});

export const TrashEntrySchema = z.object({
  path: z.string(),
  metadata: TrashEntryMetadataSchema,
  sizeBytes: z.number(),
});

export const TrashWorkspaceSchema = z.object({
  cwd: z.string(),
  entries: z.array(TrashEntrySchema),
});

export const TrashListResultMessage = DaemonBase.extend({
  type: z.literal("trash_list_result"),
  workspaces: z.array(TrashWorkspaceSchema),
  totalEntries: z.number().int(),
  totalBytes: z.number().int(),
});

export type TrashListResultMessage = z.infer<typeof TrashListResultMessage>;
