// Agent utility functions.
//
// Standalone helpers for building AI SDK call options, tool sets,
// messages, and stream event mapping.

import { tool as aiTool, stepCountIs } from "ai";
import type { ConversationContext } from "../../context/conversation-context";
import type { ModelMessage, ResponseMessage } from "../../context/conversation-context.types";
import { runSideEffectHooks } from "../../hooks";
import { resolveModel } from "../../model/model";
import { buildMessages, resolveSystemPrompt } from "../../prompts/message-builder";
import { createSandbox } from "../../sandbox/sandbox";
import { PERMISSIVE_SANDBOX_CONFIG } from "../../sandbox/sandbox.constants";
import type { Sandbox } from "../../sandbox/sandbox.types";
import { resolveTools } from "../../tools/tool.registry";
import type { ToolContext, ToolDefinition } from "../../tools/tool.types";
import type { ToolHooks } from "../hooks";
import { DEFAULT_MAX_STEPS } from "./agent.constants";
import type { AgentCallResult, AgentConfig, AgentStreamEvent, CallOptions } from "./agent.types";

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
  sandbox?: Sandbox,
): Record<string, ReturnType<typeof aiTool<any, any>>> | undefined {
  if (!toolDefinitions || Object.keys(toolDefinitions).length === 0) {
    return undefined;
  }

  // Fall back to a permissive sandbox so tools always have a sandbox available
  const effectiveSandbox = sandbox ?? createSandbox(PERMISSIVE_SANDBOX_CONFIG);

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
          sandbox: effectiveSandbox,
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
 * Resolves the model string to a LanguageModel, tool names to tool definitions,
 * then builds messages and system prompt into a single options object.
 *
 * @param config - The agent configuration.
 * @param message - The current user message.
 * @param context - The conversation context.
 * @param toolHooks - Tool hooks from the agent's mutable closure store.
 *   Dynamically appended hooks (via `hookIntoAgent`) take effect here.
 * @param abortSignal - Optional AbortSignal for cancellation.
 *
 * @throws {Error} if config.model is not set.
 * @throws {ModelResolutionError} if the model string cannot be resolved.
 */
export async function buildCallOptions(
  config: AgentConfig,
  message: string,
  context: ConversationContext,
  toolHooks?: ToolHooks,
  abortSignal?: AbortSignal,
): Promise<CallOptions> {
  if (!config.model) {
    throw new Error(
      `Agent "${config.name}" has no model configured. ` +
        "Provide a model in AgentConfig or use a custom execute override.",
    );
  }

  // Resolve model string → LanguageModel
  const languageModel = await resolveModel(config.model);

  // Resolve tool names → ToolDefinition map, then build AI SDK tool set
  const resolvedToolDefinitions = config.tools
    ? resolveTools(config.tools, config.name)
    : undefined;

  const [tools, resolvedSystemPrompt] = await Promise.all([
    Promise.resolve(buildAgentToolSet(resolvedToolDefinitions, config.name, toolHooks, config.sandbox)),
    resolveSystemPrompt({ systemPrompt: config.systemPrompt }),
  ]);

  return {
    model: languageModel,
    system: resolvedSystemPrompt,
    messages: buildMessages({ message, context }) as ModelMessage[],
    tools,
    stopWhen: stepCountIs(DEFAULT_MAX_STEPS),
    abortSignal,
    ...(config.providerOptions ? { providerOptions: config.providerOptions } : {}),
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
    case "reasoning-start":
      return { type: "thinking-start", id: streamPart.id };
    case "reasoning-delta":
      return { type: "thinking", id: streamPart.id, text: streamPart.text };
    case "reasoning-end":
      return { type: "thinking-end", id: streamPart.id };
    case "tool-call":
      return {
        type: "tool-call",
        toolName: streamPart.toolName,
        args: JSON.stringify(streamPart.args ?? streamPart.input),
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

// Stream result → AgentCallResult builder

/**
 * Build an AgentCallResult from consumed stream results.
 * Used by the shared `runStream` generator inside createAgent.
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
): AgentCallResult {
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
