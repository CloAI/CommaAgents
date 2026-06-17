// Agent utility functions.
//
// Standalone helpers for building AI SDK call options, tool sets,
// messages, and stream event mapping.

import { tool as aiTool, generateText, Output, stepCountIs } from "ai";
import type {
  ConversationContext,
  ModelMessage,
  ResponseMessage,
  SummarizeRecords,
} from "../../conversation-context";
import {
  contextTokensFromSteps,
  recordsToMessages,
} from "../../conversation-context";
import { SandboxViolationError } from "../../errors/index";
import { runSideEffectHooks, runTransformHooks } from "../../hooks";
import type { SideEffectHook, TransformHook } from "../../hooks/hooks.types";
import type { LanguageService } from "../../language";
import { resolveModel } from "../../model/model";
import {
  buildMessages,
  resolveSystemPrompt,
} from "../../prompts/message-builder";
import { createSandbox } from "../../sandbox/sandbox";
import { PERMISSIVE_SANDBOX_CONFIG } from "../../sandbox/sandbox.constants";
import type { Sandbox } from "../../sandbox/sandbox.types";
import type { SkillRegistry } from "../../skills/skills.types";
import type { AuditSink } from "../../tools/io/audit.types";
import { createFileAuditSink } from "../../tools/io/audit-sink";
import { sandboxErrorToToolError } from "../../tools/io/sandbox-error";
import type { LaunchStrategyHandle } from "../../tools/launch-strategy.types";
import { errorResult } from "../../tools/result";
import { resolveTools } from "../../tools/tool.registry";
import type {
  ToolContext,
  ToolDefinition,
  ToolError,
} from "../../tools/tool.types";
import type { InputCollector } from "../built-in/user/user-agent.types";
import type { ToolHooks } from "../hooks";
import { resolveHook } from "../hooks";
import { DEFAULT_MAX_STEPS } from "./agent.constants";
import type {
  AgentCallResult,
  AgentConfig,
  AgentStreamEvent,
  CallOptions,
} from "./agent.types";

export type AgentHookStore = {
  alterFirstCallMessage: Array<TransformHook<string>> | undefined;
  beforeFirstCall: Array<SideEffectHook<string>> | undefined;
  afterFirstCallResult: Array<SideEffectHook<AgentCallResult>> | undefined;
  alterFirstResponse: Array<TransformHook<string>> | undefined;
  alterCallMessage: Array<TransformHook<string>> | undefined;
  beforeCall: Array<SideEffectHook<string>> | undefined;
  alterResponse: Array<TransformHook<string>> | undefined;
  afterCallResult: Array<SideEffectHook<AgentCallResult>> | undefined;
  onStreamEvent: Array<SideEffectHook<AgentStreamEvent>> | undefined;
  beforeToolCall:
    | Array<
        SideEffectHook<{
          readonly name: string;
          readonly args: string;
          readonly toolContext: ToolContext;
        }>
      >
    | undefined;
  afterToolCall:
    | Array<
        SideEffectHook<{
          readonly name: string;
          readonly args: string;
          readonly result: string;
          readonly toolContext: ToolContext;
        }>
      >
    | undefined;
};

/** Build a ToolHooks view from the mutable store for passing to buildCallOptions. */
export function getToolHooks(hooks: AgentHookStore): ToolHooks {
  return {
    beforeToolCall: hooks.beforeToolCall,
    afterToolCall: hooks.afterToolCall,
  };
}

/**
 * Run the pre-call hook lifecycle and return the altered message.
 */
export async function runPreCallHooks(
  hooks: AgentHookStore,
  message: string,
  isFirst: boolean,
): Promise<string> {
  const alteredMessage = await runTransformHooks(
    resolveHook(hooks.alterFirstCallMessage, hooks.alterCallMessage, isFirst),
    message,
  );
  await runSideEffectHooks(
    resolveHook(hooks.beforeFirstCall, hooks.beforeCall, isFirst),
    alteredMessage,
  );
  return alteredMessage;
}

/**
 * Run the post-call hook lifecycle and return the result with altered text.
 */
export async function runPostCallHooks(
  hooks: AgentHookStore,
  result: AgentCallResult,
  isFirst: boolean,
): Promise<AgentCallResult> {
  await runSideEffectHooks(
    resolveHook(hooks.afterFirstCallResult, hooks.afterCallResult, isFirst),
    result,
  );
  const alteredText = await runTransformHooks(
    resolveHook(hooks.alterFirstResponse, hooks.alterResponse, isFirst),
    result.text,
  );
  return { ...result, text: alteredText };
}

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
 * @param sessionId - Propagated to `ToolContext.sessionId`. Identifies a
 *   broader user/daemon session; used by audit log / trash metadata.
 * @param auditSink - Explicit audit sink. When omitted but `sessionId` is set,
 *   a `createFileAuditSink(sandbox.cwd)` is constructed automatically.
 * @param skillRegistry - Propagated to `ToolContext.skillRegistry`.
 * @param inputCollector - Propagated to `ToolContext.inputCollector`.
 * @param launchStrategy - Propagated to `ToolContext.launchStrategy`.
 * @param languageService - Propagated to `ToolContext.languageService`.
 * @param runId - Propagated to `ToolContext.runId`. Identifies a single
 *   strategy invocation (top-level run *or* one `launch_strategy`
 *   sub-load). Tools that need per-launch isolation (notably `todo_*`)
 *   silo on this. Kept distinct from `sessionId`.
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
  languageService?: LanguageService,
  runId?: string,
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
          ...(runId !== undefined ? { runId } : {}),
          ...(effectiveAuditSink !== undefined
            ? { auditSink: effectiveAuditSink }
            : {}),
          ...(skillRegistry !== undefined ? { skillRegistry } : {}),
          ...(inputCollector !== undefined ? { inputCollector } : {}),
          ...(launchStrategy !== undefined ? { launchStrategy } : {}),
          ...(languageService !== undefined ? { languageService } : {}),
        };

        // AI SDK v6's `tool()` wrapper does NOT validate the
        // `inputSchema` against the LLM's arguments before invoking
        // execute — the schema is used only for JSON-schema
        // generation. So an LLM that sends `{}` or partial args would
        // crash deep inside the tool (destructuring undefined fields,
        // calling `guard.authorize(undefined)`, etc.) and the thrown
        // error would surface to the model as an empty string by
        // default, with no signal to self-correct.
        //
        // We bridge that gap here: parse the args against the tool's
        // declared schema ourselves. On failure, return a structured
        // error result describing exactly what's missing or invalid
        // so the LLM can fix its next call.
        let parsedArguments: unknown;
        try {
          const parseResult = definition.parameters.safeParse(toolArguments);
          if (!parseResult.success) {
            const issues = parseResult.error.issues
              .map((issue) => {
                const path =
                  issue.path.length > 0 ? issue.path.join(".") : "(root)";
                return `- \`${path}\`: ${issue.message}`;
              })
              .join("\n");
            const validationError: ToolError = {
              kind: "unknown",
              message:
                `Invalid arguments for \`${name}\`:\n${issues}\n\n` +
                `Received: ${argsString}`,
              recoverable: true,
              suggestedNextAction:
                `Re-call \`${name}\` with the missing or corrected fields. ` +
                `Check the tool's parameter schema in your system prompt.`,
            };
            const baseOutput = errorResult<unknown>(validationError).output;
            // Mirror the success-path formatting so the LLM sees the
            // "Next step:" suffix and treats this as a recoverable
            // error rather than an opaque failure.
            const validationOutput = validationError.suggestedNextAction
              ? `${baseOutput}\n\nNext step: ${validationError.suggestedNextAction}`
              : baseOutput;
            await runSideEffectHooks(toolHooks?.afterToolCall, {
              name,
              args: argsString,
              result: validationOutput,
              toolContext,
            });
            return validationOutput;
          }
          parsedArguments = parseResult.data;
        } catch (caught) {
          // safeParse should never throw, but guard anyway.
          return `Tool argument validation failed unexpectedly: ${caught instanceof Error ? caught.message : String(caught)}`;
        }

        try {
          await runSideEffectHooks(toolHooks?.beforeToolCall, {
            name,
            args: argsString,
            toolContext,
          });

          const result = await definition.execute(parsedArguments, toolContext);

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
          // Convert thrown errors into structured tool results so the
          // LLM always sees a useful message instead of an empty
          // string. Without this, AI SDK v6 surfaces uncaught throws
          // as `output: ""`, which gives the model no feedback to
          // self-correct and triggers infinite-retry loops.
          let toolErr: ToolError;
          if (caught instanceof SandboxViolationError) {
            toolErr = sandboxErrorToToolError(caught);
          } else {
            toolErr = {
              kind: "unknown",
              message: `Tool \`${name}\` threw: ${caught instanceof Error ? caught.message : String(caught)}`,
              recoverable: true,
              suggestedNextAction:
                "Inspect the error message, correct your arguments or assumptions, and retry. If the cause is unclear, re-read the file with `read_file` to refresh your state.",
            };
          }
          const errorOutput = errorResult<unknown>(toolErr).output;
          const llmOutput = toolErr.suggestedNextAction
            ? `${errorOutput}\n\nNext step: ${toolErr.suggestedNextAction}`
            : errorOutput;
          await runSideEffectHooks(toolHooks?.afterToolCall, {
            name,
            args: argsString,
            result: llmOutput,
            toolContext,
          });
          return llmOutput;
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

  await context.prepareForCall({ agentName: config.name });

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
        config.languageService,
        config.runId,
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
    stopWhen: stepCountIs(config.maxSteps ?? DEFAULT_MAX_STEPS),
    ...(config.providerOptions
      ? { providerOptions: config.providerOptions as Record<string, unknown> }
      : {}),
    ...(config.outputSchema
      ? { output: Output.object({ schema: config.outputSchema }) }
      : {}),
    ...(config.modelOptions ?? {}),
  };
}

const SUMMARIZER_SYSTEM_PROMPT =
  "You compress conversation history. Produce a concise summary that preserves " +
  "key facts, decisions, open questions, and any state later turns depend on. " +
  "Write in plain prose; do not add commentary or address the user.";

const SUMMARIZER_INSTRUCTION =
  "Summarize the conversation above for use as compacted context.";

/**
 * Build the default summarizer used by context compaction. Resolves the model
 * lazily so unused summarizers cost nothing.
 *
 * @param model - Model identifier in "providerID/modelID" format.
 */
export function createModelSummarizer(model: string): SummarizeRecords {
  return async (records) => {
    const languageModel = await resolveModel(model);
    const result = await generateText({
      model: languageModel,
      system: SUMMARIZER_SYSTEM_PROMPT,
      messages: [
        ...recordsToMessages(records),
        { role: "user", content: SUMMARIZER_INSTRUCTION },
      ],
    });
    return result.text;
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
  const contextTokens = contextTokensFromSteps(steps);
  return {
    text,
    responseMessages,
    steps,
    usage: {
      promptTokens: totalUsage.inputTokens ?? 0,
      completionTokens: totalUsage.outputTokens ?? 0,
    },
    ...(contextTokens !== undefined ? { contextTokens } : {}),
    finishReason: finishReason ?? "stop",
  };
}
