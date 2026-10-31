import { z } from "zod";

import { defineTool } from "../../define/define-tool";
import { errorResult, okResult, toolError } from "../../result";
import type { ToolDefinition } from "../../tool.types";
import { describeTool } from "../describe-tool";
import { MAX_DELEGATION_DEPTH, MAX_TASKS_PER_CALL } from "./delegate.constants";
import type { DelegateData, DelegateTaskResult } from "./delegate.types";
import {
  describeSubagents,
  parseStructuredAnswer,
  taskInput,
} from "./delegate.utils";

export const delegateParams = z.object({
  tasks: z
    .array(
      z
        .object({
          agent: z
            .string()
            .min(1)
            .describe(
              "Subagent name from the delegate section of your instructions.",
            ),
          description: z
            .string()
            .min(1)
            .describe("3–5 word label shown to the user."),
          goal: z
            .string()
            .min(1)
            .describe("What the subagent must accomplish and return."),
          context: z
            .string()
            .describe(
              "Everything the subagent needs to know; it cannot see this conversation.",
            ),
        })
        .strict(),
    )
    .min(1)
    .max(MAX_TASKS_PER_CALL),
});

/**
 * Build the `delegate` tool, which runs subagent strategies in parallel and returns their answers.
 *
 * The subagents an agent may use come from its `subagents` definition and reach the tool
 * through {@link ToolContext.subagents}. Each task runs as a child strategy through the
 * runtime's {@link ToolContext.launchStrategy} handle, limited to {@link MAX_DELEGATION_DEPTH}
 * levels of nesting.
 *
 * @returns {ToolDefinition<typeof delegateParams, DelegateData>} The tool definition.
 * @example
 * ```ts
 * registerTool("delegate", createDelegateTool());
 * ```
 */
export function createDelegateTool(): ToolDefinition<
  typeof delegateParams,
  DelegateData
> {
  return defineTool<typeof delegateParams, DelegateData>({
    description: describeTool({
      purpose: [
        "Hand one or more tasks to subagents and wait for all of their answers.",
        "Tasks in one call run in parallel. Each subagent starts with fresh context, so goal and context must be self-contained.",
      ],
      inputs: [
        {
          name: "tasks",
          type: "array<{ agent, description, goal, context }>",
          required: true,
          description: `1–${MAX_TASKS_PER_CALL} tasks. \`agent\` must name a subagent listed in your instructions.`,
        },
      ],
      outputs:
        "`{ results: [{ agent, description, ok, text, data? }] }` in request order; `data` holds parsed JSON when a subagent answers with structured output.",
      errors: [
        {
          kind: "not_found",
          description:
            "A task names a subagent you cannot use. Pick a name from the delegate section of your instructions.",
        },
        {
          kind: "unknown",
          description: "No runtime is available to run subagents.",
        },
      ],
      notes: [
        "A failed task is reported in its result entry; the other tasks still return.",
      ],
    }),
    parameters: delegateParams,
    systemPrompt: (toolContext) =>
      toolContext.subagents && toolContext.subagents.length > 0
        ? describeSubagents(toolContext.subagents)
        : "",
    execute: async ({ tasks }, toolContext) => {
      const subagents = toolContext.subagents ?? [];
      const unknown = tasks
        .map((task) => task.agent)
        .filter(
          (agent) => !subagents.some((subagent) => subagent.name === agent),
        );
      if (unknown.length > 0) {
        const available = subagents.map((subagent) => subagent.name);
        return errorResult<DelegateData>(
          toolError(
            "not_found",
            `Unknown subagent(s): ${unknown.join(", ")}. Available: [${available.join(", ")}].`,
            { recoverable: available.length > 0, details: { available } },
          ),
        );
      }
      const launch = toolContext.launchStrategy;
      if (launch === undefined) {
        return errorResult<DelegateData>(
          toolError(
            "unknown",
            "delegate needs a runtime that can launch strategies.",
            {
              recoverable: false,
            },
          ),
        );
      }
      const settled = await Promise.allSettled(
        tasks.map((task) => {
          const target = subagents.find(
            (subagent) => subagent.name === task.agent,
          )!;
          return launch({
            messageId: toolContext.messageId,
            toolCallId: toolContext.toolCallId,
            strategyPath: target.strategyPath,
            ...(target.manifestPath
              ? { manifestPath: target.manifestPath }
              : {}),
            input: taskInput(task.goal, task.context),
            maxDepth: MAX_DELEGATION_DEPTH,
          });
        }),
      );
      const results = settled.map((outcome, taskIndex): DelegateTaskResult => {
        const task = tasks[taskIndex]!;
        if (outcome.status === "rejected") {
          return {
            agent: task.agent,
            description: task.description,
            ok: false,
            text:
              outcome.reason instanceof Error
                ? outcome.reason.message
                : String(outcome.reason),
          };
        }
        const data = parseStructuredAnswer(outcome.value.text);
        return {
          agent: task.agent,
          description: task.description,
          ok: true,
          text: outcome.value.text,
          ...(data === undefined ? {} : { data }),
        };
      });
      const output = results
        .map(
          (result) =>
            `### ${result.agent}: ${result.description}${result.ok ? "" : " (failed)"}\n${result.text}`,
        )
        .join("\n\n");
      return okResult<DelegateData>(output, { data: { results } });
    },
  });
}
