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
    question: z.string(),
    ts: z.string(),
  })
  .strict();
export const WatchQuestionsMessageSchema = z.discriminatedUnion("type", [
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
