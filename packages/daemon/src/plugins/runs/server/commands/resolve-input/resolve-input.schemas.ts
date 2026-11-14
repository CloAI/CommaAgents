import { z } from "zod/v4";
import { RunArgumentsSchema } from "../../server.schemas";
export const ResolveInputArgumentsSchema = RunArgumentsSchema.extend({
  inputId: z.string().min(1),
  text: z.string(),
}).strict();
export const ResolveInputOutputSchema = z.null();
