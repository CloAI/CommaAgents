import { z } from "zod/v4";
export const AnswerQuestionArgumentsSchema = z
  .object({
    runId: z.string().min(1),
    requestId: z.string().min(1),
    response: z.string(),
  })
  .strict();
export const AnswerQuestionOutputSchema = z
  .object({ answered: z.boolean() })
  .strict();
