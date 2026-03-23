// Agent utility functions.
//
// Standalone helpers for building AI SDK call options, tool sets,
// messages, and stream event mapping.

import type { LanguageModel } from "ai";
import { tool as aiTool, stepCountIs } from "ai";
import { runSideEffectHooks } from "../../hooks/types";
import type { ConversationHistory } from "../../prompts/history/conversation-history";
import { buildMessages, resolveSystemPrompt } from "../../prompts/message-builder";
import type { ModelMessage, ResponseMessage } from "../../prompts/types";
import type { ToolContext, ToolDef } from "../../tools/tool.types";
import { DEFAULT_MAX_STEPS } from "./agent.constants";
import type { AgentConfig, AgentStreamEvent, LLMCallResult } from "./agent.types";
import type { ToolHooks } from "../hooks/hooks";

// Tool set builder

/**
 * Converts a ToolDef map into the AI SDK's tool format.
 * Wraps each tool's execute with ToolHooks (beforeToolCall / afterToolCall).
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- AI SDK Tool generics vary per tool
export function buildAgentToolSet(
  toolDefs: Readonly<Record<string, ToolDef>> | undefined,
  agentName: string,
  toolHooks?: ToolHooks,
): Record<string, ReturnType<typeof aiTool<any, any>>> | undefined {
  if (!toolDefs || Object.keys(toolDefs).length === 0) {
    return undefined;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- AI SDK Tool generics are complex
  const toolSet: Record<string, ReturnType<typeof aiTool<any, any>>> = {};

  for (const [name, def] of Object.entries(toolDefs)) {
    toolSet[name] = aiTool({
      description: def.description,
      inputSchema: def.parameters,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- args type varies per tool definition
      execute: async (args: any, options: any) => {
        const argsStr = JSON.stringify(args);

        // Before tool call hooks
        await runSideEffectHooks(toolHooks?.beforeToolCall, {
          name,
          args: argsStr,
        });

        // Execute the tool
        const ctx: ToolContext = {
          agentName,
          abort: options.abortSignal ?? AbortSignal.timeout(30_000),
        };

        const result = await def.execute(args, ctx);

        // After tool call hooks
        await runSideEffectHooks(toolHooks?.afterToolCall, {
          name,
          args: argsStr,
          result: result.output,
        });

        return result.output;
      },
    });
  }

  return toolSet;
}

// AI SDK call options builder

/** Common options passed to generateText / streamText. */
interface CallOptions {
  readonly model: LanguageModel;
  readonly system: string | undefined;
  readonly messages: ModelMessage[];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- AI SDK Tool generics vary per tool
  readonly tools: Record<string, ReturnType<typeof aiTool<any, any>>> | undefined;
  readonly stopWhen: ReturnType<typeof stepCountIs>;
  readonly temperature: number | undefined;
  readonly topP: number | undefined;
  readonly abortSignal: AbortSignal | undefined;
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

  const [tools, system] = await Promise.all([
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
    system,
    messages: buildMessages({ message, history, prefix: config.prefixMessages }) as ModelMessage[],
    tools,
    stopWhen: stepCountIs(config.maxSteps ?? DEFAULT_MAX_STEPS),
    temperature: config.temperature,
    topP: config.topP,
    abortSignal: config.abort,
  };
}

// Stream part → AgentStreamEvent mapper

/**
 * Maps an AI SDK stream part to an AgentStreamEvent.
 * Returns undefined for parts we don't surface (e.g., finish, error).
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- AI SDK fullStream part is a complex union
export function mapStreamPart(part: any): AgentStreamEvent | undefined {
  switch (part.type) {
    case "text-delta":
      return { type: "text", text: part.text };
    case "tool-call":
      return {
        type: "tool-call",
        toolName: part.toolName,
        args: JSON.stringify(part.args),
      };
    case "tool-result":
      return {
        type: "tool-result",
        toolName: part.toolName,
        output: typeof part.output === "string" ? part.output : JSON.stringify(part.output),
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
