// debugAgent + debugFlow — hook verbose logging into existing agents and flows.
//
// These follow the hookInto* pattern: they mutate in-place via hookIntoAgent
// and hookIntoFlow.

import type { Agent, AgentCallResult } from "@comma-agents/core";
import { hookIntoAgent, hookIntoFlow } from "@comma-agents/core";
import type { DebugOptions } from "./debug.types";
import {
  breakLines,
  describeAgentConfig,
  formatText,
  formatTokens,
  resolveOptions,
} from "./debug.utils";

// debugAgent

/**
 * Hook debug logging into an existing agent.
 *
 * Immediately prints the agent's config (name, system prompt, tools).
 * Then injects hooks that log every `call()` with input/output previews
 * and every tool invocation with name, args, and result.
 *
 * Uses `hookIntoAgent` internally — the agent must have been created
 * by `createAgent()`.
 *
 * @param agent - An agent created by `createAgent()`.
 * @param options - Debug output options.
 *
 * @example
 * ```ts
 * import { createAgent } from "@comma-agents/core";
 * import { debugAgent } from "@comma-agents/debug";
 *
 * const writer = createAgent({ name: "writer", model, systemPrompt: "..." });
 * debugAgent(writer);
 *
 * const result = await writer.call("Hello");
 * // Logs: [writer] <- "Hello"
 * // Logs:   [weather] called by "writer" with {"city":"Tokyo"}
 * // Logs:   [weather] -> "18°C, partly cloudy"
 * // Logs: [writer] -> "The weather in Tokyo is..."
 * ```
 */
export function debugAgent(agent: Agent, options?: DebugOptions): void {
  const opts = resolveOptions(options);
  const emit = (line: string) =>
    opts.output(breakLines(line, opts.breakLineAfter));

  // Print static config description immediately
  describeAgentConfig(agent, opts);

  // Hook lifecycle logging
  hookIntoAgent(agent, {
    beforeCall: [
      async (message: string) => {
        emit(`[${agent.name}] <- "${formatText(message, opts)}"`);
      },
    ],
    afterCallResult: [
      async (result: AgentCallResult) => {
        emit(`[${agent.name}] -> "${formatText(result.text, opts)}"`);
      },
    ],
    beforeToolCall: [
      async ({
        name,
        args,
      }: {
        readonly name: string;
        readonly args: string;
      }) => {
        emit(
          `  [${name}] called by "${agent.name}" with ${formatText(args, opts)}`,
        );
      },
    ],
    afterToolCall: [
      async ({
        name,
        result,
      }: {
        readonly name: string;
        readonly args: string;
        readonly result: string;
      }) => {
        emit(`  [${name}] -> "${formatText(result, opts)}"`);
      },
    ],
  });
}

// debugFlow

/**
 * Hook debug logging into an existing flow.
 *
 * Injects hooks that log flow start/end and each step's input/output
 * with previews and token usage.
 *
 * Uses `hookIntoFlow` internally — the flow must have been created
 * by one of the flow factories (`createSequentialFlow`,
 * `createCycleFlow`, `createBroadcastFlow`, `createFlow`, or
 * `buildFlowAgent`).
 *
 * @param flow - A flow agent created by a flow factory.
 * @param options - Debug output options.
 *
 * @example
 * ```ts
 * import { createSequentialFlow } from "@comma-agents/core";
 * import { debugFlow } from "@comma-agents/debug";
 *
 * const pipeline = createSequentialFlow({
 *   name: "my-pipeline",
 *   steps: [writer, reviewer, editor],
 * });
 * debugFlow(pipeline);
 *
 * const result = await pipeline.call("Write a debounce function");
 * // Logs each step with input/output/tokens
 * ```
 */
export function debugFlow(flow: Agent, options?: DebugOptions): void {
  const opts = resolveOptions(options);
  const emit = (line: string) =>
    opts.output(breakLines(line, opts.breakLineAfter));

  // Hook lifecycle logging
  hookIntoFlow(flow, {
    beforeFlow: [
      async (message: string) => {
        emit("");
        emit(`── Flow: ${flow.name} ──`);
        emit(`  Input: "${formatText(message, opts)}"`);
      },
    ],
    beforeStep: [
      async ({
        stepName,
        message,
      }: {
        readonly stepName: string;
        readonly message: string;
      }) => {
        emit("");
        emit(`  ── Step: ${stepName} ──`);
        emit(`    Input:  "${formatText(message, opts)}"`);
      },
    ],
    afterStep: [
      async ({
        result,
      }: {
        readonly stepName: string;
        readonly message: string;
        readonly result: {
          readonly text: string;
          readonly usage: {
            readonly promptTokens: number;
            readonly completionTokens: number;
          };
        };
      }) => {
        emit(`    Output: "${formatText(result.text, opts)}"`);
        if (opts.showTokens) {
          emit(`    ${formatTokens(result.usage)}`);
        }
      },
    ],
    afterFlow: [
      async (_message: string) => {
        emit("");
        emit(`── Flow: ${flow.name} ── Done`);
        emit("");
      },
    ],
  });
}
