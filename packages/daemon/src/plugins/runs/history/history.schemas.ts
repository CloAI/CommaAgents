import { z } from "zod/v4";
import { RunHistoryEntrySchema } from "../messages/messages.schemas";
export const RunHistoryPageSchema = z
  .object({
    entries: z.array(RunHistoryEntrySchema).readonly(),
    page: z
      .object({ hasMore: z.boolean(), before: z.string().optional() })
      .strict(),
  })
  .strict();
