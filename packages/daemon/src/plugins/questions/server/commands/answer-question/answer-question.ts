import type { z } from "zod/v4";
import { defineCommand } from "../../../../../daemon-plugin";
import type { CommandContext } from "../../../../../daemon-plugin";
import type { QuestionsPlugin } from "../../../questions.types";
import {
  AnswerQuestionArgumentsSchema,
  AnswerQuestionOutputSchema,
} from "./answer-question.schemas";
export const answerQuestionCommand = defineCommand({
  name: "questions.answer",
  arguments: AnswerQuestionArgumentsSchema,
  output: AnswerQuestionOutputSchema,
  handle({
    plugin,
    arguments: { runId, requestId, response },
  }: CommandContext<
    QuestionsPlugin,
    undefined,
    z.output<typeof AnswerQuestionArgumentsSchema>
  >) {
    return { answered: plugin.resolveQuestion(runId, requestId, response) };
  },
});
