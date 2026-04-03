// Agent utility functions.
//
// Standalone helpers for building AI SDK call options, tool sets,
// messages, and stream event mapping.

import { tool as aiTool, stepCountIs } from "ai";
import { runSideEffectHooks } from "../../hooks";
import type { ConversationHistory } from "../../prompts/history/conversation-history";
import { buildMessages, resolveSystemPrompt } from "../../prompts/message-builder";
import type { ModelMessage, ResponseMessage } from "../../prompts/types";
import type { ToolContext, ToolDefinition } from "../../tools/tool.types";
import type { ToolHooks } from "../hooks";
import { DEFAULT_MAX_STEPS } from "./agent.constants";
import type { AgentConfig, AgentStreamEvent, CallOptions, LLMCallResult } from "./agent.types";

// Tool set builder

/**
 * Converts a ToolDef map into the AI SDK's tool format.
 * Wraps each tool's execute with ToolHooks (beforeToolCall / afterToolCall).
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- AI SDK Tool generics vary per tool
export function buildAgentToolSet(
  toolDefinitions: Readonly<Record<string, ToolDefinition>> | undefined,
  agentName: string,
  toolHooks?: ToolHooks,
): Record<string, ReturnType<typeof aiTool<any, any>>> | undefined {
  if (!toolDefinitions || Object.keys(toolDefinitions).length === 0) {
    return undefined;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- AI SDK Tool generics are complex
  const toolSet: Record<string, ReturnType<typeof aiTool<any, any>>> = {};

  for (const [name, definition] of Object.entries(toolDefinitions)) {
    toolSet[name] = aiTool({
      description: definition.description,
      inputSchema: definition.parameters,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- args type varies per tool definition
      execute: async (toolArguments: any, options: any) => {
        const argsString = JSON.stringify(toolArguments);

        // Before tool call hooks
        await runSideEffectHooks(toolHooks?.beforeToolCall, {
          name,
          args: argsString,
        });

        // Execute the tool
        const toolContext: ToolContext = {
          agentName,
          abort: options.abortSignal ?? AbortSignal.timeout(30_000),
        };

        const result = await definition.execute(toolArguments, toolContext);

        // After tool call hooks
        await runSideEffectHooks(toolHooks?.afterToolCall, {
          name,
          args: argsString,
          result: result.output,
        });

        return result.output;
      },
    });
  }

  return toolSet;
}

/**
 * Build the full AI SDK call options from agent config + current message.
 * Resolves tools, messages, and system prompt into a single options object.
 *
 * @param config - The agent configuration.
 * @param message - The current user message.
 * @param history - The conversation history.
 * @param toolHooksOverride - Mutable tool hooks from the agent's closure store.
 *   When provided, these are used instead of `config.toolHooks`, ensuring that
 *   dynamically appended hooks (via `hookIntoAgent`) take effect.
 *
 * @throws {Error} if config.model is not set.
 */
export async function buildCallOptions(
  config: AgentConfig,
  message: string,
  history: ConversationHistory,
  toolHooksOverride?: ToolHooks,
): Promise<CallOptions> {
  if (!config.model) {
    throw new Error(
      `Agent "${config.name}" has no model configured. ` +
        "Provide a model in AgentConfig or use a custom execute override.",
    );
  }

  const [tools, resolvedSystemPrompt] = await Promise.all([
    Promise.resolve(
      buildAgentToolSet(config.tools, config.name, toolHooksOverride ?? config.toolHooks),
    ),
    resolveSystemPrompt({
      systemPrompt: config.systemPrompt,
      systemPromptTemplate: config.systemPromptTemplate,
      templateOverrides: config.templateOverrides,
    }),
  ]);

  return {
    model: config.model,
    system: resolvedSystemPrompt,
    messages: buildMessages({ message, history, prefix: config.prefixMessages }) as ModelMessage[],
    tools,
    stopWhen: stepCountIs(config.maxSteps ?? DEFAULT_MAX_STEPS),
    temperature: config.temperature,
    topP: config.topProbability,
    abortSignal: config.abort,
  };
}

// Stream part → AgentStreamEvent mapper

/**
 * Maps an AI SDK stream part to an AgentStreamEvent.
 * Returns undefined for parts we don't surface (e.g., finish, error).
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- AI SDK fullStream part is a complex union
export function mapStreamPart(streamPart: any): AgentStreamEvent | undefined {
  switch (streamPart.type) {
    case "text-delta":
      return { type: "text", text: streamPart.text };
    case "tool-call":
      return {
        type: "tool-call",
        toolName: streamPart.toolName,
        args: JSON.stringify(streamPart.args),
      };
    case "tool-result":
      return {
        type: "tool-result",
        toolName: streamPart.toolName,
        output:
          typeof streamPart.output === "string"
            ? streamPart.output
            : JSON.stringify(streamPart.output),
      };
    case "start-step":
      return { type: "step-start" };
    default:
      return undefined;
  }
}

// Stream result → LLMCallResult builder

/**
 * Build an LLMCallResult from consumed stream results.
 * Used by both `stream()` and `_callStream()` to avoid duplication.
 */
export function buildStreamCallResult(
  text: string,
  responseMessages: readonly ResponseMessage[],
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- AI SDK step types are complex generics
  steps: ReadonlyArray<any>,
  totalUsage: {
    readonly inputTokens: number | undefined;
    readonly outputTokens: number | undefined;
  },
  finishReason: string | null | undefined,
): LLMCallResult {
  return {
    text,
    responseMessages,
    steps,
    usage: {
      promptTokens: totalUsage.inputTokens ?? 0,
      completionTokens: totalUsage.outputTokens ?? 0,
    },
    finishReason: finishReason ?? "stop",
  };
}
