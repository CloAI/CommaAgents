import type { z } from "zod/v4";
import { defineCommand } from "../../../../../daemon-plugin";
import type { CommandContext } from "../../../../../daemon-plugin";
import type { QuestionsPlugin } from "../../../questions.types";
import {
  SubmitAnswersArgumentsSchema,
  SubmitAnswersOutputSchema,
} from "./submit-answers.schemas";
export const submitAnswersCommand = defineCommand({
  name: "questions.submit",
  arguments: SubmitAnswersArgumentsSchema,
  output: SubmitAnswersOutputSchema,
  handle({
    plugin,
    arguments: { runId, requestId, submissionId, response },
  }: CommandContext<
    QuestionsPlugin,
    undefined,
    z.output<typeof SubmitAnswersArgumentsSchema>
  >) {
    return plugin.submitAnswers(runId, requestId, submissionId, response);
  },
});
