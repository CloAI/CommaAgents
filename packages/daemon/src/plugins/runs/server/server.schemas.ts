import { z } from "zod/v4";
export const RunArgumentsSchema = z
  .object({ runId: z.string().min(1) })
  .strict();
export { RunErrorSchema, RunSnapshotSchema } from "../state/state.schemas";
export const HistoryOptionsSchema = z
  .object({
    limit: z.number().int().min(1).max(200).default(25),
    before: z.string().min(1).optional(),
  })
  .strict();
