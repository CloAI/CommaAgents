import { z } from "zod/v4";
import { RunArgumentsSchema } from "../../server.schemas";
export const ContinueRunArgumentsSchema = RunArgumentsSchema.extend({
  input: z.string().default(""),
}).strict();
export const ContinueRunOutputSchema = z.null();
