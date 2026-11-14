import {
  DEFAULT_HISTORY_MESSAGE_LIMIT,
  MAX_HISTORY_MESSAGE_LIMIT,
} from "../history/history.constants";
import { z } from "zod/v4";
export const RunArgumentsSchema = z
  .object({ runId: z.string().min(1) })
  .strict();
export { RunErrorSchema, RunSnapshotSchema } from "../state/state.schemas";
export const HistoryOptionsSchema = z
  .object({
    limit: z
      .number()
      .int()
      .min(1)
      .max(MAX_HISTORY_MESSAGE_LIMIT)
      .default(DEFAULT_HISTORY_MESSAGE_LIMIT),
    before: z.string().min(1).optional(),
  })
  .strict();
