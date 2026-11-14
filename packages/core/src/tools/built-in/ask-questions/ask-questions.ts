import {
  QuestionsSchema,
  QuestionsResponseSchema,
  validateQuestionsResponse,
} from "../../../questions";
import { defineTool } from "../../define/define-tool";
import { errorResult, okResult, toolError } from "../../result";
import type { ToolDefinition } from "../../tool.types";
import type { AskQuestionsData } from "./ask-questions.types";

export const askQuestionsParams = QuestionsSchema;

/**
 * Create the tool that presents one questionnaire and awaits all answers together.
 * @returns {ToolDefinition} A typed questionnaire tool.
 * @example
 * const tool = createAskQuestionsTool();
 */
export function createAskQuestionsTool(): ToolDefinition<
  typeof askQuestionsParams,
  AskQuestionsData
> {
  return defineTool({
    description:
      "Ask the user one or more composed questions in a single questionnaire. Fields support multiline text, single or multiple choices, and labeled numeric sliders. Recommendations are optional metadata, never automatic answers. The user submits all answers together and may replace any question with Other text or skip it.",
    parameters: askQuestionsParams,
    async execute(questionnaire, { requestQuestions, agentName, abort }) {
      if (!requestQuestions) {
        return errorResult(
          toolError("unknown", "Question requester is not available", {
            recoverable: false,
          }),
        );
      }
      try {
        const response = QuestionsResponseSchema.parse(
          await requestQuestions({
            ...questionnaire,
            agentName,
            toolName: "ask_questions",
            signal: abort,
          }),
        );
        const issues = validateQuestionsResponse(questionnaire, response);
        if (issues.length > 0) {
          return errorResult(
            toolError("unknown", "Invalid questionnaire response", {
              recoverable: true,
              details: { issues },
            }),
          );
        }
        return okResult(JSON.stringify(response), { data: response });
      } catch (error) {
        return errorResult(
          toolError(
            "unknown",
            error instanceof Error ? error.message : String(error),
            { recoverable: true },
          ),
        );
      }
    },
  });
}
