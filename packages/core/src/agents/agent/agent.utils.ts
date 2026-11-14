import { BUILT_IN_TOOL_NAMES } from "../../tools/tool.constants";
import { findCommaProjectRoot } from "../../defaults/defaults";
import type { StepResult, TextStreamPart, ToolSet } from "ai";
import { tool as aiTool, generateText, Output, stepCountIs } from "ai";
import type {
  CompactionOptions,
  ConversationContext,
  ModelMessage,
  ResponseMessage,
  SummarizeRecords,
} from "../../conversation-context";
import {
  buildCompactionInstruction,
  CompactionSummaryRejectedError,
  contextUsageFromSteps,
  recordsToMessages,
} from "../../conversation-context";
import { COMPACTION_SYSTEM_PROMPT } from "../../conversation-context/retention/compaction/compaction.constants";
import { SandboxViolationError } from "../../errors/index";
import { runSideEffectHooks, runTransformHooks } from "../../hooks";
import type { SideEffectHook, TransformHook } from "../../hooks/hooks.types";
import { parseMcpToolName } from "../../mcp";
import { resolveModel, resolveModelWithPrivacy } from "../../model/model";
import type { ModelResolutionOptions } from "../../model/model.types";
import { privacyError } from "../../model/privacy/privacy.utils";
import type { PrivacyReport } from "../../model/privacy";
import { getQualifiedModelMetadata } from "../../model/model.utils";
import {
  buildMessages,
  resolveSystemPrompt,
} from "../../prompts/message-builder";
import { createSandbox } from "../../sandbox/sandbox";
import { PERMISSIVE_SANDBOX_OPTIONS } from "../../sandbox/sandbox.constants";
import type { AuditSink } from "../../tools/io/audit.types";
import { createFileAuditSink } from "../../tools/io/audit-sink";
import { sandboxErrorToToolError } from "../../tools/io/sandbox-error";
import { errorResult } from "../../tools/result";
import { resolveTools } from "../../tools/tool.registry";
import type {
  ToolContext,
  ToolDefinition,
  ToolError,
} from "../../tools/tool.types";
import type { AgentHooks, ToolHooks } from "../hooks";
import { resolveHook } from "../hooks";
import { DEFAULT_MAX_STEPS } from "./agent.constants";
import type {
  AgentCallResult,
  AgentConfig,
  AgentRuntime,
  AgentStreamEvent,
  BuildCallOptionsResult,
} from "./agent.types";

export interface BuildAgentToolSetOptions {
  readonly toolDefinitions:
    | Readonly<Record<string, ToolDefinition>>
    | undefined;
  readonly agentName: string;
  readonly toolHooks?: ToolHooks;
  readonly runtime?: AgentRuntime;
  readonly sessionId?: string;
  readonly auditSink?: AuditSink;
}

export type AgentHookStore = {
  onCallCompleted?: AgentHooks["onCallCompleted"];
  onCallStarted?: AgentHooks["onCallStarted"];
  onCallFailed?: AgentHooks["onCallFailed"];
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
 * Tools call `ctx.guard.authorize()` for path resolution, workspace boundaries,
 * and policy evaluation.
 *
 * @param options - Tool definitions, agent identity, hooks, and runtime services.
 */
export function buildAgentToolSet({
  toolDefinitions,
  agentName,
  toolHooks,
  runtime = {},
  sessionId,
  auditSink,
}: BuildAgentToolSetOptions): ToolSet | undefined {
  if (!toolDefinitions || Object.keys(toolDefinitions).length === 0) {
    return undefined;
  }

  // Fall back to a permissive sandbox so tools always have a guard available
  const effectiveSandbox =
    runtime.sandbox ?? createSandbox(PERMISSIVE_SANDBOX_OPTIONS);

  // Resolve the audit sink.
  const workspaceCwd = effectiveSandbox.cwd;
  const auditRoot = findCommaProjectRoot(workspaceCwd);
  const effectiveAuditSink: AuditSink | undefined =
    auditSink ??
    (sessionId !== undefined && auditRoot
      ? createFileAuditSink(auditRoot)
      : undefined);

  const toolSet: ToolSet = {};

  for (const [name, definition] of Object.entries(toolDefinitions)) {
    // Per-tool guard from the sandbox, with tool-level policies
    const guard = effectiveSandbox.guardFor(name, definition.policies);

    toolSet[name] = aiTool({
      description: definition.description,
      inputSchema: definition.parameters,
      execute: async (
        toolArguments: unknown,
        options: { abortSignal?: AbortSignal; toolCallId?: string },
      ) => {
        const argsString = JSON.stringify(toolArguments);

        const toolContext: ToolContext = {
          agentName,
          messageId: runtime.messageId,
          toolCallId: options.toolCallId,
          guard,
          abort: options.abortSignal ?? new AbortController().signal,
          ...(sessionId !== undefined ? { sessionId } : {}),
          ...(runtime.runId !== undefined ? { runId: runtime.runId } : {}),
          ...(effectiveAuditSink !== undefined
            ? { auditSink: effectiveAuditSink }
            : {}),
          ...(runtime.skillRegistry !== undefined
            ? { skillRegistry: runtime.skillRegistry }
            : {}),
          ...(runtime.inputCollector !== undefined
            ? { inputCollector: runtime.inputCollector }
            : {}),
          ...(runtime.launchStrategy !== undefined
            ? { launchStrategy: runtime.launchStrategy }
            : {}),
          ...(runtime.languageService !== undefined
            ? { languageService: runtime.languageService }
            : {}),
          ...(runtime.questionsRequester !== undefined
            ? { requestQuestions: runtime.questionsRequester }
            : {}),
          ...(runtime.subagents !== undefined
            ? { subagents: runtime.subagents }
            : {}),
          ...(runtime.requestStrategySwitch !== undefined
            ? { requestStrategySwitch: runtime.requestStrategySwitch }
            : {}),
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
          if (toolContext.abort.aborted) {
            throw caught;
          }
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
 * @param runtime - Services available to the agent's tools.
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
  runtime: AgentRuntime,
  message: string,
  context: ConversationContext,
  toolHooks?: ToolHooks,
  abortSignal?: AbortSignal,
  onPrivacyReport?: (report: PrivacyReport) => void,
): Promise<BuildCallOptionsResult> {
  if (!config.model) {
    throw new Error(
      `Agent "${config.name}" has no model configured. ` +
        "Provide a model in AgentConfig or use a custom execute override.",
    );
  }

  const configuredModel = config.model;

  // Resolve before compaction so bare IDs inherit the selected provider's protection.
  let resolvedModel = config.privacy?.tee
    ? undefined
    : await resolveModelWithPrivacy(configuredModel, {
        privacy: config.privacy,
        privacyRuntime: runtime.privacyRuntime,
        signal: abortSignal,
        onPrivacyReport,
      });
  if (resolvedModel?.privacy?.tee) {
    if (compactionOptionsOf(config)?.summarize) {
      throw privacyError("PRIVACY_CONFIGURATION_ERROR");
    }
    config = { ...config, privacy: resolvedModel.privacy };
    runtime = { ...runtime, privacyRuntime: resolvedModel.privacyRuntime };
  }

  const modelMetadata = getQualifiedModelMetadata(configuredModel);
  const lastActiveRecord = context
    .records(config.name)
    .filter((record) => record.status !== "superseded")
    .at(-1);
  const retentionEvents = await context.prepareForCall({
    agentName: config.name,
    model: configuredModel,
    ...(config.privacy?.tee || config.privacy?.e2ee
      ? {
          summarize: createModelSummarizer(
            compactionOptionsOf(config)?.model ?? configuredModel,
            {
              privacy: config.privacy,
              privacyRuntime: runtime.privacyRuntime,
              signal: abortSignal,
              onPrivacyReport,
            },
            compactionOptionsOf(config)?.extraSections,
          ),
        }
      : {}),
    ...(lastActiveRecord?.contextUsage !== undefined
      ? { contextUsage: lastActiveRecord.contextUsage }
      : {}),
    ...(modelMetadata?.metadata.contextWindow !== undefined
      ? { contextWindow: modelMetadata.metadata.contextWindow }
      : {}),
    ...(modelMetadata?.metadata.maxInputTokens !== undefined
      ? { maxInputTokens: modelMetadata.metadata.maxInputTokens }
      : {}),
  });

  resolvedModel ??= await resolveModelWithPrivacy(configuredModel, {
    privacy: config.privacy,
    privacyRuntime: runtime.privacyRuntime,
    signal: abortSignal,
    onPrivacyReport,
  });

  // Resolve tool names → ToolDefinition map, then build AI SDK tool set
  const resolvedToolDefinitions = resolveTools(
    config.tools ?? BUILT_IN_TOOL_NAMES,
    config.name,
  );

  const [tools, resolvedSystemPrompt] = await Promise.all([
    Promise.resolve({
      ...(buildAgentToolSet({
        toolDefinitions: resolvedToolDefinitions,
        agentName: config.name,
        toolHooks,
        runtime,
      }) ?? {}),
      ...(runtime.mcpTools ?? {}),
    }),
    resolveSystemPrompt({ systemPrompt: config.systemPrompt }),
  ]);

  return {
    retentionEvents,
    callOptions: {
      model: resolvedModel.model,
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
    },
  };
}

/**
 * The agent's compaction settings when they are given as an options object.
 * @param {AgentConfig} config - Agent configuration.
 * @returns {CompactionOptions | undefined} Compaction options, if set as an object.
 */
export function compactionOptionsOf(
  config: AgentConfig,
): CompactionOptions | undefined {
  const compaction = config.context?.compaction;
  return typeof compaction === "object" ? compaction : undefined;
}

/**
 * Build the default summarizer used by context compaction. Resolves the model
 * lazily so unused summarizers cost nothing. A summary cut off by the output
 * limit is rejected, so compaction keeps the original records.
 *
 * @param {string} model - Model identifier in "providerID/modelID" format.
 * @param {ModelResolutionOptions} [options] - Inherited privacy requirements, request cancellation, and report collector.
 * @param {readonly string[]} [extraSections] - Section headings added to the standard summary template.
 * @returns {SummarizeRecords} Invocation-bound summarizer.
 */
export function createModelSummarizer(
  model: string,
  options?: ModelResolutionOptions,
  extraSections?: readonly string[],
): SummarizeRecords {
  return async (records) => {
    const languageModel = await resolveModel(model, options);
    const result = await generateText({
      model: languageModel,
      abortSignal: options?.signal,
      system: COMPACTION_SYSTEM_PROMPT,
      messages: [
        ...recordsToMessages(records),
        { role: "user", content: buildCompactionInstruction(extraSections) },
      ],
    });
    if (result.finishReason === "length") {
      throw new CompactionSummaryRejectedError(
        "The compaction summary hit the output limit and was discarded.",
      );
    }
    return result.text;
  };
}

// Stream part → AgentStreamEvent mapper

/**
 * Maps an AI SDK stream part to an AgentStreamEvent.
 * Returns undefined for parts we don't surface (e.g., finish, error).
 */
export function mapStreamPart(
  streamPart: TextStreamPart<ToolSet>,
): AgentStreamEvent | undefined {
  switch (streamPart.type) {
    case "text-delta":
      return { type: "text", text: streamPart.text };
    case "reasoning-start":
      return { type: "thinking-start", id: streamPart.id };
    case "reasoning-delta":
      return { type: "thinking", id: streamPart.id, text: streamPart.text };
    case "reasoning-end":
      return { type: "thinking-end", id: streamPart.id };
    case "tool-call": {
      const mcp = parseMcpToolName(streamPart.toolName);
      return {
        type: "tool-call",
        toolCallId: streamPart.toolCallId,
        toolName: streamPart.toolName,
        args: JSON.stringify(
          "args" in streamPart ? streamPart.args : streamPart.input,
        ),
        ...(mcp ? { mcp } : {}),
      };
    }
    case "tool-result": {
      const mcp = parseMcpToolName(streamPart.toolName);
      return {
        type: "tool-result",
        toolCallId: streamPart.toolCallId,
        toolName: streamPart.toolName,
        output:
          typeof streamPart.output === "string"
            ? streamPart.output
            : JSON.stringify(streamPart.output),
        status: "completed",
        ...(mcp ? { mcp } : {}),
      };
    }
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
        ...(parseMcpToolName(streamPart.toolName)
          ? { mcp: parseMcpToolName(streamPart.toolName) }
          : {}),
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
  steps: ReadonlyArray<StepResult<ToolSet>>,
  totalUsage: {
    readonly inputTokens: number | undefined;
    readonly outputTokens: number | undefined;
  },
  finishReason: string | null | undefined,
): AgentCallResult {
  const contextUsage = contextUsageFromSteps(steps);
  return {
    text,
    responseMessages,
    steps,
    usage: {
      promptTokens: totalUsage.inputTokens ?? 0,
      completionTokens: totalUsage.outputTokens ?? 0,
    },
    ...(contextUsage !== undefined ? { contextUsage } : {}),
    finishReason: finishReason ?? "stop",
  };
}

/**
 * Build valid partial context, pairing every issued tool call with its settled outcome.
 * @param {readonly AgentStreamEvent[]} events - Delivered generation and settled tool events.
 * @returns {AgentCallResult} Interrupted response usable as conversation context.
 * @internal
 */
export function interruptedCallResult(
  events: readonly AgentStreamEvent[],
): AgentCallResult {
  const responseMessages: ResponseMessage[] = [];
  let assistantContent: Extract<
    ResponseMessage,
    { role: "assistant" }
  >["content"] = [];
  let partialText = "";
  const toolResults = new Map<
    string,
    Extract<AgentStreamEvent, { type: "tool-result" }>
  >();
  for (const event of events) {
    if (event.type === "tool-result") {
      toolResults.set(event.toolCallId, event);
    }
  }
  const emittedTools = new Set<string>();
  for (const event of events) {
    if (event.type === "text") {
      partialText += event.text;
      if (Array.isArray(assistantContent)) {
        assistantContent.push({ type: "text", text: event.text });
      }
    } else if (
      event.type === "tool-call" &&
      !emittedTools.has(event.toolCallId)
    ) {
      emittedTools.add(event.toolCallId);
      let toolInput: unknown;
      try {
        toolInput = JSON.parse(event.args);
      } catch {
        toolInput = event.args;
      }
      if (Array.isArray(assistantContent)) {
        assistantContent.push({
          type: "tool-call",
          toolCallId: event.toolCallId,
          toolName: event.toolName,
          input: toolInput,
        });
      }
      responseMessages.push({ role: "assistant", content: assistantContent });
      assistantContent = [];
      const outcome = toolResults.get(event.toolCallId);
      responseMessages.push({
        role: "tool",
        content: [
          {
            type: "tool-result",
            toolCallId: event.toolCallId,
            toolName: event.toolName,
            output: {
              type: outcome?.status === "completed" ? "text" : "error-text",
              value:
                outcome?.status === "completed"
                  ? outcome.output
                  : (outcome?.error ??
                    "Tool cancelled by user steering; its effects may be incomplete. Do not automatically replay it."),
            },
          },
        ],
      });
    }
  }
  if (assistantContent.length) {
    responseMessages.push({ role: "assistant", content: assistantContent });
  }
  return {
    text: partialText,
    responseMessages,
    steps: [],
    usage: { promptTokens: 0, completionTokens: 0 },
    finishReason: "user_steering",
  };
}
