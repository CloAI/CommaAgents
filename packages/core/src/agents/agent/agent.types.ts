// Agent types — all agent-domain type definitions.

import type { tool as aiTool, LanguageModel, ModelMessage, StepResult, stepCountIs } from "ai";
import type {
  ConversationHistoryConfig,
  ConversationTurn,
  PromptTemplate,
  ResponseMessage,
  TemplateVariables,
} from "../../prompts/types";
import type { ToolDefinition } from "../../tools/tool.types";
import type { AgentHooks, ToolHooks } from "../hooks";

/** Configuration for creating an LLM-backed agent via `createAgent()`. */
export interface AgentConfig {
  /** Unique name for this agent. */
  readonly name: string;
  /** AI SDK language model instance (e.g., `openai("gpt-4o")`). Optional if a custom execute override is provided. */
  readonly model?: LanguageModel;
  /**
   * System prompt sent to the model at the start of every call.
   * For dynamic system prompts with variable interpolation, use `systemPromptTemplate` instead.
   */
  readonly systemPrompt?: string;
  /**
   * Dynamic system prompt template using Liquid syntax.
   * Takes precedence over `systemPrompt` if both are provided.
   *
   * @example
   * ```ts
   * import { createPromptTemplate } from "@comma-agents/core";
   *
   * const agent = createAgent({
   *   name: "reviewer",
   *   model: openai("gpt-4o"),
   *   systemPromptTemplate: createPromptTemplate({
   *     template: "You are {{ role }}, reviewing {{ language }} code.",
   *     variables: { role: "a senior engineer", language: "TypeScript" },
   *   }),
   * });
   * ```
   */
  readonly systemPromptTemplate?: PromptTemplate;
  /** Override variables for the system prompt template (per-agent overrides). */
  readonly templateOverrides?: TemplateVariables;
  /** Tools the agent can invoke during a call. Keys become tool names. */
  readonly tools?: Readonly<Record<string, ToolDefinition>>;
  /** Agent lifecycle hooks. */
  readonly hooks?: AgentHooks;
  /** Tool lifecycle hooks (before/after each tool execution). */
  readonly toolHooks?: ToolHooks;
  /**
   * Maximum number of LLM round-trips (steps) per call.
   * Each tool-call + response counts as one step.
   * @default 10
   */
  readonly maxSteps?: number;
  /** Sampling temperature (0-2). */
  readonly temperature?: number;
  /** Nucleus sampling probability. */
  readonly topProbability?: number;
  /** Whether to use streaming internally. @default false */
  readonly stream?: boolean;
  /** AbortSignal for cancellation. */
  readonly abort?: AbortSignal;
  /**
   * Conversation history configuration.
   * Controls windowing, truncation, and token limits.
   *
   * @example
   * ```ts
   * const agent = createAgent({
   *   name: "chatbot",
   *   model: openai("gpt-4o"),
   *   systemPrompt: "You are helpful.",
   *   historyConfig: { maxTurns: 20 },
   * });
   * ```
   */
  readonly historyConfig?: ConversationHistoryConfig;
  /**
   * Prefix messages to prepend before conversation history.
   * Useful for few-shot examples or static context.
   * Accepts native AI SDK `ModelMessage` objects.
   */
  readonly prefixMessages?: readonly ModelMessage[];
  /**
   * Custom execute override — replaces the LLM call with arbitrary logic.
   *
   * When set, `model` is not required. Return a plain `string` (a synthetic
   * `LLMCallResult` with an `{ role: "assistant" }` message will be created
   * automatically) or a full `LLMCallResult` for complete control.
   *
   * Streaming is not supported when `execute` is set — calling `stream()`
   * will throw.
   *
   * @example
   * ```ts
   * const echo = createAgent({
   *   name: "echo",
   *   execute: async (message) => `Echo: ${message}`,
   * });
   * ```
   */
  readonly execute?: (message: string) => Promise<string | LLMCallResult>;
}

/**
 * The unified agent contract. Every agent — LLM-backed, human-in-the-loop,
 * flow, or custom — implements this interface.
 *
 * **Required fields** (`name`, `call`, `reset`) are the polymorphic minimum
 * that flows and orchestration depend on.
 *
 * **Optional fields** (`stream`, `getHistory`, `getTurns`, `config`) are
 * provided by LLM-backed agents created via `createAgent()`. Consumer code
 * that needs LLM-specific features can check for their existence or work
 * with a known `createAgent()` result.
 *
 * @example
 * ```ts
 * // Flows accept any Agent — only name, call, reset are required
 * const flow = createSequentialFlow({
 *   name: "pipeline",
 *   agents: [llmAgent, userAgent, customAgent],
 * });
 *
 * // LLM-specific features are optional
 * const agent = createAgent({ name: "writer", model: openai("gpt-4o") });
 * const history = agent.getHistory();            // always present on createAgent results
 * for await (const event of agent.stream("Hi")) { ... }
 * ```
 */
export interface Agent {
  /** Unique name for this agent. */
  readonly name: string;

  /**
   * Call the agent with a message.
   * Runs the full hook lifecycle around the core action.
   */
  call(message: string): Promise<AgentCallResult>;

  /** Reset internal state (history, first-call flag, etc.). */
  reset(): void;

  // -- Optional LLM-specific fields (present on createAgent results) --

  /** Stream a call, yielding events as they arrive. */
  stream?(message: string): AsyncGenerator<AgentStreamEvent>;
  /** Get conversation history as AI SDK messages. */
  getHistory?(): readonly ModelMessage[];
  /** Get conversation turns (user+assistant pairs). */
  getTurns?(): readonly ConversationTurn[];
  /** The agent's configuration. */
  readonly config?: AgentConfig;

  /**
   * Append a hook callback to this agent's lifecycle.
   * Used internally by `hookIntoAgent` — not part of the public API.
   * @internal
   */
  appendHook?(hookName: string, callback: unknown): void;
}

/**
 * Result from any agent call — the minimal contract that all agents
 * (LLM-backed, human-in-the-loop, custom) must satisfy.
 *
 * Contains only the fields that flows and orchestration actually consume.
 * For LLM-specific details (response messages, step introspection), see
 * {@link LLMCallResult}.
 */
export interface AgentCallResult {
  /** The final text response from the agent. */
  readonly text: string;
  /** Total token usage across all steps. Zero for non-LLM agents. */
  readonly usage: {
    readonly promptTokens: number;
    readonly completionTokens: number;
  };
  /** Why the agent stopped (e.g., "stop", "tool-calls", "length"). */
  readonly finishReason: string;
}

/**
 * Extended call result for LLM-backed agents (`createAgent`).
 *
 * Adds AI SDK-specific fields that are meaningful only when an LLM was
 * invoked. Flows and orchestration work with `AgentCallResult`; consumers
 * who need LLM details can narrow to `LLMCallResult` when working with
 * a known `createAgent()` instance.
 *
 * @example
 * ```ts
 * const agent = createAgent({ name: "writer", model: openai("gpt-4o") });
 * const result = await agent.call("Hello"); // typed as LLMCallResult
 * console.log(result.responseMessages); // full AI SDK message chain
 * console.log(result.steps);            // tool calls, reasoning, etc.
 * ```
 */
export interface LLMCallResult extends AgentCallResult {
  /**
   * The response messages from the AI SDK.
   * Contains the full assistant + tool message chain, preserving tool calls,
   * tool results, reasoning, and multi-modal content.
   * This is exactly `result.response.messages` from the AI SDK.
   */
  readonly responseMessages: readonly ResponseMessage[];
  /** All steps taken during this call (LLM calls + tool executions). */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- AI SDK step generics are complex
  readonly steps: ReadonlyArray<StepResult<any>>;
}

/** Event emitted during a streaming agent call. */
export type AgentStreamEvent =
  | { readonly type: "text"; readonly text: string }
  | { readonly type: "tool-call"; readonly toolName: string; readonly args: string }
  | { readonly type: "tool-result"; readonly toolName: string; readonly output: string }
  | { readonly type: "step-start" }
  | { readonly type: "done"; readonly result: AgentCallResult };

/** Common options passed to generateText / streamText. */
export interface CallOptions {
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
