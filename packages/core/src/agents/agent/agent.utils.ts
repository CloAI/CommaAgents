// Agent utility functions.
//
// Standalone helpers for building AI SDK call options, tool sets,
// messages, and stream event mapping.

import { tool as aiTool } from "ai";
import type { ConversationContext } from "../../context/conversation-context";
import type {
  ModelMessage,
  ResponseMessage,
} from "../../context/conversation-context.types";
import { SandboxViolationError } from "../../errors/index";
import { runSideEffectHooks } from "../../hooks";
import { resolveModel } from "../../model/model";
import {
  buildMessages,
  resolveSystemPrompt,
} from "../../prompts/message-builder";
import { createSandbox } from "../../sandbox/sandbox";
import { PERMISSIVE_SANDBOX_CONFIG } from "../../sandbox/sandbox.constants";
import type { Sandbox } from "../../sandbox/sandbox.types";
import type { SkillRegistry } from "../../skills/skills.types";
import type { AuditSink } from "../../tools/io/audit";
import { createFileAuditSink } from "../../tools/io/audit-sink";
import type { LaunchStrategyHandle } from "../../tools/launch-strategy.types";
import { sandboxErrorToToolError } from "../../tools/io/sandbox-error";
import { errorResult } from "../../tools/result";
import { resolveTools } from "../../tools/tool.registry";
import type { ToolContext, ToolDefinition } from "../../tools/tool.types";
import type { InputCollector } from "../built-in/user/user-agent.types";
import type { ToolHooks } from "../hooks";
import type {
  AgentCallResult,
  AgentConfig,
  AgentStreamEvent,
  CallOptions,
} from "./agent.types";

// Tool set builder

/**
 * Converts a ToolDef map into the AI SDK's tool format.
 * Wraps each tool's execute with ToolHooks and a centralized
 * SandboxViolationError → ToolError catch.
 *
 * Each tool gets its own per-tool Guard from `sandbox.guardFor(toolName)`.
 * Tools call `ctx.guard.authorize()` for path resolution, jail enforcement,
 * and policy evaluation.
 *
 * @param toolDefinitions - The tool definitions to wrap.
 * @param agentName - Surfaced on `ToolContext.agentName` and audit entries.
 * @param toolHooks - Optional side-effect hooks invoked around each call.
 * @param sandbox - Guard registry; falls back to a permissive sandbox.
 * @param sessionId - Propagated to `ToolContext.sessionId`.
 * @param auditSink - Explicit audit sink. When omitted but `sessionId` is set,
 *   a `createFileAuditSink(sandbox.cwd)` is constructed automatically.
 * @param skillRegistry - Propagated to `ToolContext.skillRegistry`.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- AI SDK Tool generics vary per tool
export function buildAgentToolSet(
  toolDefinitions: Readonly<Record<string, ToolDefinition>> | undefined,
  agentName: string,
  toolHooks?: ToolHooks,
  sandbox?: Sandbox,
  sessionId?: string,
  auditSink?: AuditSink,
  skillRegistry?: SkillRegistry,
  inputCollector?: InputCollector,
  launchStrategy?: LaunchStrategyHandle,
): Record<string, ReturnType<typeof aiTool<any, any>>> | undefined {
  if (!toolDefinitions || Object.keys(toolDefinitions).length === 0) {
    return undefined;
  }

  // Fall back to a permissive sandbox so tools always have a guard available
  const effectiveSandbox = sandbox ?? createSandbox(PERMISSIVE_SANDBOX_CONFIG);

  // Resolve the audit sink.
  const workspaceCwd = effectiveSandbox.cwd;
  const effectiveAuditSink: AuditSink | undefined =
    auditSink ??
    (sessionId !== undefined ? createFileAuditSink(workspaceCwd) : undefined);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- AI SDK Tool generics are complex
  const toolSet: Record<string, ReturnType<typeof aiTool<any, any>>> = {};

  for (const [name, definition] of Object.entries(toolDefinitions)) {
    // Per-tool guard from the sandbox, with tool-level policies
    const guard = effectiveSandbox.guardFor(name, definition.policies);

    // Wire tool-level policies into the guard's chain
    if (definition.policies) {
      for (const policy of definition.policies) {
        guard.addPolicy(policy);
      }
    }

    toolSet[name] = aiTool({
      description: definition.description,
      inputSchema: definition.parameters,
      execute: async (
        toolArguments: unknown,
        options: { abortSignal?: AbortSignal },
      ) => {
        const argsString = JSON.stringify(toolArguments);

        const toolContext: ToolContext = {
          agentName,
          guard,
          abort: options.abortSignal ?? AbortSignal.timeout(30_000),
          ...(sessionId !== undefined ? { sessionId } : {}),
          ...(effectiveAuditSink !== undefined
            ? { auditSink: effectiveAuditSink }
            : {}),
          ...(skillRegistry !== undefined ? { skillRegistry } : {}),
          ...(inputCollector !== undefined ? { inputCollector } : {}),
          ...(launchStrategy !== undefined ? { launchStrategy } : {}),
        };

        try {
          await runSideEffectHooks(toolHooks?.beforeToolCall, {
            name,
            args: argsString,
            toolContext,
          });

          const result = await definition.execute(toolArguments, toolContext);

          const llmOutput =
            !result.ok &&
            result.error?.recoverable &&
            result.error.suggestedNextAction
              ? `${result.output}\n\nNext step: ${result.error.suggestedNextAction}`
              : result.output;

          await runSideEffectHooks(toolHooks?.afterToolCall, {
            name,
            args: argsString,
            result: llmOutput,
            toolContext,
          });

          return llmOutput;
        } catch (caught) {
          if (caught instanceof SandboxViolationError) {
            return errorResult<unknown>(
              sandboxErrorToToolError(caught),
            ) as unknown as string;
          }
          throw caught;
        }
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
    Promise.resolve(
      buildAgentToolSet(
        resolvedToolDefinitions,
        config.name,
        toolHooks,
        config.sandbox,
        undefined,
        undefined,
        config.skillRegistry,
        config.inputCollector,
        config.launchStrategy,
      ),
    ),
    resolveSystemPrompt({ systemPrompt: config.systemPrompt }),
  ]);

  return {
    model: languageModel,
    system: resolvedSystemPrompt,
    messages: buildMessages({ message, context }) as ModelMessage[],
    tools,
    abortSignal,
    ...(config.providerOptions
      ? { providerOptions: config.providerOptions as Record<string, unknown> }
      : {}),
    ...(config.modelOptions ?? {}),
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
        toolCallId: streamPart.toolCallId,
        toolName: streamPart.toolName,
        args: JSON.stringify(streamPart.args ?? streamPart.input),
      };
    case "tool-result":
      return {
        type: "tool-result",
        toolCallId: streamPart.toolCallId,
        toolName: streamPart.toolName,
        output:
          typeof streamPart.output === "string"
            ? streamPart.output
            : JSON.stringify(streamPart.output),
        status: "completed",
      };
    case "tool-error": {
      // The AI SDK surfaces tool execution failures as `tool-error` parts
      // separate from `tool-result`. We collapse them into a single
      // `tool-result` segment with `status: "error"` so downstream
      // consumers (TUI, logs, persistence) only have to handle one shape
      // per call. The `output` is left empty intentionally — the
      // human-readable failure message lives on `error`.
      const rawError = streamPart.error;
      const errorMessage =
        rawError instanceof Error
          ? rawError.message
          : typeof rawError === "string"
            ? rawError
            : rawError !== undefined
              ? JSON.stringify(rawError)
              : "Tool execution failed";
      return {
        type: "tool-result",
        toolCallId: streamPart.toolCallId,
        toolName: streamPart.toolName,
        output: "",
        status: "error",
        error: errorMessage,
      };
    }
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

// Replay result builder

/** Extract a flat text body from an assistant turn's response messages. */
function extractTextFromResponseMessages(
  responseMessages: readonly ResponseMessage[],
): string {
  let text = "";
  for (const responseMessage of responseMessages) {
    if (responseMessage.role !== "assistant") continue;
    const { content } = responseMessage;
    if (typeof content === "string") {
      text += content;
    } else if (Array.isArray(content)) {
      for (const part of content) {
        if (part.type === "text") text += part.text;
      }
    }
  }
  return text;
}

/**
 * Build an `AgentCallResult` from a hydrated `ConversationTurn`'s response
 * messages. Used by the agent's replay path: no LLM call, no tokens,
 * no steps — just rehydrate the prior call's output.
 */
export function buildReplayCallResult(
  responseMessages: readonly ResponseMessage[],
): AgentCallResult {
  return {
    text: extractTextFromResponseMessages(responseMessages),
    responseMessages,
    steps: [],
    usage: { promptTokens: 0, completionTokens: 0 },
    finishReason: "stop",
  };
}
