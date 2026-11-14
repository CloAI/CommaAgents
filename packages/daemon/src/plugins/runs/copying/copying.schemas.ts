import { z } from "zod/v4";
import { RunSnapshotSchema } from "../state/state.schemas";
import { ConversationEventSchema } from "../conversation/conversation.schemas";
import { RunHistoryEntrySchema } from "../messages/messages.schemas";

export const CopyCheckpointSchema = z
  .object({
    version: z.literal(1),
    checkpointId: z.string().min(1),
    rootRunId: z.string().min(1),
    completedAt: z.iso.datetime(),
    runs: z
      .array(
        z
          .object({
            snapshot: RunSnapshotSchema,
            conversation: z.array(ConversationEventSchema),
            history: z.array(RunHistoryEntrySchema),
          })
          .strict(),
      )
      .min(1),
  })
  .strict();

export const CopyManifestSchema = z
  .object({
    version: z.literal(1),
    sourceRunId: z.string().min(1),
    checkpointId: z.string().min(1),
    targetRunId: z.string().min(1),
    cwd: z.string().min(1),
    committed: z.boolean(),
    identities: z.record(z.string().min(1), z.string().min(1)),
  })
  .strict();

export type CopyCheckpoint = z.infer<typeof CopyCheckpointSchema>;
export type CopyManifest = z.infer<typeof CopyManifestSchema>;
