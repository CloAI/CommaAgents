import type { QuestionsResponse } from "@comma-agents/core";
import { z } from "zod/v4";
import { QuestionsResponseSchema } from "@comma-agents/core";

export const SubmitAnswersArgumentsSchema = z
  .object({
    runId: z.string().min(1),
    requestId: z.string().min(1),
    submissionId: z.string().min(1),
    response: z.custom<QuestionsResponse>().transform((value, context) => {
      const result = QuestionsResponseSchema.safeParse(value);
      if (!result.success) {
        context.addIssue({ code: "custom", message: result.error.message });
        return z.NEVER;
      }
      return result.data;
    }),
  })
  .strict();
export const SubmitAnswersOutputSchema = z
  .object({ accepted: z.literal(true), replayed: z.boolean() })
  .strict();
