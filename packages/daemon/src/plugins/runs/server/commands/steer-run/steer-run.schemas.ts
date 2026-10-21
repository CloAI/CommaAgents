import { z } from "zod/v4";
import { RunArgumentsSchema } from "../../server.schemas";
export const SteerRunArgumentsSchema = RunArgumentsSchema.extend({
  text: z.string(),
}).strict();
export const SteerRunOutputSchema = z.null();
