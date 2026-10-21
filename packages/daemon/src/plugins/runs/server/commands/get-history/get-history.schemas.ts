import { HistoryOptionsSchema } from "../../server.schemas";
import { z } from "zod/v4";
export { RunHistoryPageSchema as GetHistoryOutputSchema } from "../../../history/history.schemas";
export const GetHistoryArgumentsSchema = HistoryOptionsSchema.extend({
  runId: z.string().min(1),
}).strict();
