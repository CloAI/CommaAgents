import type { Question } from "@comma-agents/core";
import { QuestionsSchema } from "@comma-agents/core";
import { z } from "zod/v4";
export const WatchQuestionsArgumentsSchema = z
  .object({ runId: z.string().min(1) })
  .strict();
export const PendingQuestionSchema = z
  .object({
    runId: z.string(),
    parentRunId: z.string().optional(),
    requestId: z.string(),
    agentName: z.string(),
    toolName: z.string(),
    questions: z.custom<readonly Question[]>().transform((value, context) => {
      const result = QuestionsSchema.safeParse({ questions: value });
      if (!result.success) {
        context.addIssue({ code: "custom", message: result.error.message });
        return z.NEVER;
      }
      return result.data.questions;
    }),
    ts: z.string(),
  })
  .strict();
export const WatchQuestionsMessageSchema = z.discriminatedUnion("type", [
  z
    .object({
      type: z.literal("questions.snapshot"),
      data: z.object({ requests: z.array(PendingQuestionSchema) }).strict(),
    })
    .strict(),
  z
    .object({
      type: z.literal("question.requested"),
      data: PendingQuestionSchema,
    })
    .strict(),
  z
    .object({
      type: z.literal("question.resolved"),
      data: z.object({ runId: z.string(), requestId: z.string() }).strict(),
    })
    .strict(),
]);
