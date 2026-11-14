import { z } from "zod";

import { discoverStrategies } from "../../../strategy/discover/discover";
import { defineTool } from "../../define/define-tool";
import { errorResult, okResult, toolError } from "../../result";
import type { ToolDefinition } from "../../tool.types";
import { describeTool } from "../describe-tool";
import {
  QuestionsSchema,
  QuestionsResponseSchema,
  validateQuestionsResponse,
} from "../../../questions";
import type { RequestStrategySwitchData } from "./request-strategy-switch.types";

export const requestStrategySwitchParams = z.object({
  strategy: z
    .string()
    .min(1)
    .describe("Name of the strategy to continue in, e.g. Build or Plan."),
  reason: z
    .string()
    .min(1)
    .describe("One sentence telling the user why switching helps now."),
});

/**
 * Build the `request_strategy_switch` tool, which asks the user to continue the conversation in another strategy.
 *
 * The user confirms through the run's question channel. An approved switch is queued with the
 * runtime's {@link ToolContext.requestStrategySwitch} handle and takes effect when the current turn
 * hands back to the user; the conversation so far is carried into the new strategy.
 *
 * @returns {ToolDefinition<typeof requestStrategySwitchParams, RequestStrategySwitchData>} The tool definition.
 * @example
 * ```ts
 * registerTool("request_strategy_switch", createRequestStrategySwitchTool());
 * ```
 */
export function createRequestStrategySwitchTool(): ToolDefinition<
  typeof requestStrategySwitchParams,
  RequestStrategySwitchData
> {
  return defineTool<
    typeof requestStrategySwitchParams,
    RequestStrategySwitchData
  >({
    description: describeTool({
      purpose: [
        "Ask the user to continue this conversation in another strategy, for example from Plan to Build once a plan is ready.",
        "The user must approve. An approved switch happens when your turn ends; finish your answer normally after calling this tool.",
      ],
      inputs: [
        {
          name: "strategy",
          type: "string",
          required: true,
          description: "Strategy name, e.g. Build, Plan, or Chat.",
        },
        {
          name: "reason",
          type: "string",
          required: true,
          description: "Why switching helps now, shown to the user.",
        },
      ],
      outputs: "`{ strategyName, approved, response }`.",
      errors: [
        {
          kind: "not_found",
          description:
            "No strategy has that name. Use a name the user or your instructions mention.",
        },
        {
          kind: "unknown",
          description: "This run cannot switch strategies or ask the user.",
        },
      ],
    }),
    parameters: requestStrategySwitchParams,
    async execute({ strategy, reason }, toolContext) {
      const {
        requestStrategySwitch,
        requestQuestions,
        agentName,
        abort,
        guard,
      } = toolContext;
      if (
        requestStrategySwitch === undefined ||
        requestQuestions === undefined
      ) {
        return errorResult<RequestStrategySwitchData>(
          toolError("unknown", "This run cannot switch strategies.", {
            recoverable: false,
          }),
        );
      }
      const { strategies } = await discoverStrategies({
        cwd: guard.cwd || undefined,
      });
      const wanted = strategy.toLowerCase();
      const target = strategies.find(
        (candidate) =>
          candidate.name.toLowerCase() === wanted ||
          candidate.label.toLowerCase() === wanted,
      );
      if (target === undefined) {
        const available = strategies.map((candidate) => candidate.name);
        return errorResult<RequestStrategySwitchData>(
          toolError(
            "not_found",
            `No strategy named "${strategy}". Available: [${available.join(", ")}].`,
            {
              recoverable: true,
              details: { available },
            },
          ),
        );
      }
      try {
        const questionnaire = QuestionsSchema.parse({
          questions: [
            {
              id: "strategy-switch",
              prompt: `Switch this conversation to ${target.name}? ${reason}`,
              fields: [
                {
                  id: "decision",
                  type: "choice",
                  label: "Decision",
                  options: [
                    { id: "switch", label: "Switch" },
                    { id: "stay", label: "Stay" },
                  ],
                },
                {
                  id: "feedback",
                  type: "text",
                  label: "Feedback",
                  required: false,
                },
              ],
            },
          ],
        });
        const response = QuestionsResponseSchema.parse(
          await requestQuestions({
            ...questionnaire,
            agentName,
            toolName: "request_strategy_switch",
            signal: abort,
          }),
        );
        const issues = validateQuestionsResponse(questionnaire, response);
        if (issues.length > 0) {
          return errorResult<RequestStrategySwitchData>(
            toolError("unknown", "Invalid strategy-switch response", {
              recoverable: false,
              details: { issues },
            }),
          );
        }
        const answer = response.answers[0];
        const approved =
          answer?.type === "answered" &&
          Array.isArray(answer.values.decision) &&
          answer.values.decision.length === 1 &&
          answer.values.decision[0] === "switch";
        if (approved) {
          await requestStrategySwitch({
            strategyPath: target.path,
            ...(target.manifestPath
              ? { manifestPath: target.manifestPath }
              : {}),
          });
        }
        const data = { strategyName: target.name, approved, response };
        return okResult<RequestStrategySwitchData>(
          approved
            ? `The user approved. The conversation continues in ${target.name} after your turn ends; finish your answer now.`
            : `The user declined switching to ${target.name}: ${JSON.stringify(response)}. Continue in the current strategy.`,
          { data },
        );
      } catch (caught) {
        return errorResult<RequestStrategySwitchData>(
          toolError(
            "unknown",
            caught instanceof Error ? caught.message : String(caught),
            {
              recoverable: false,
            },
          ),
        );
      }
    },
  });
}
