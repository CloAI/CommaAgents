import { z } from "zod";
import { defineTool } from "../../define/define-tool";
import { errorResult, okResult, toolError } from "../../result";
import type { ToolDefinition } from "../../tool.types";
import { describeTool } from "../describe-tool";

export const askQuestionParams = z.object({
  question: z
    .string()
    .min(1)
    .describe("The question to ask the user for feedback or clarification."),
});

export interface AskQuestionData {
  readonly response: string;
}

/**
 * Create the `ask_question` tool.
 *
 * @example
 * ```ts
 * const askQuestion = createAskQuestionTool();
 * ```
 */
export function createAskQuestionTool(): ToolDefinition<
  typeof askQuestionParams,
  AskQuestionData
> {
  return defineTool<typeof askQuestionParams, AskQuestionData>({
    description: describeTool({
      purpose:
        "Prompt the user for feedback or answer any clarifying questions the agent might have.",
      inputs: [
        {
          name: "question",
          type: "string",
          required: true,
          description: "The feedback/question to present to the user.",
        },
      ],
      outputs: "`{ response }` — the user's direct text response.",
      errors: [
        {
          kind: "unknown",
          description:
            "No onQuestion handler is configured or execution aborted.",
        },
      ],
    }),
    parameters: askQuestionParams,
    async execute(validatedArguments, toolContext) {
      const { question } = validatedArguments;
      const { guard, agentName, abort } = toolContext;

      try {
        if (!guard.askQuestion) {
          return errorResult(
            toolError(
              "unknown",
              "askQuestion callback is not available on guard",
              { recoverable: false },
            ),
          );
        }

        const response = await guard.askQuestion(question, {
          agentName,
          toolName: "ask_question",
          signal: abort,
        });

        return okResult(`User response: "${response}"`, { data: { response } });
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
