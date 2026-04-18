// Agent types — all agent-domain type definitions.

import type { AbortableAsyncGenerator, AbortablePromise } from "@comma-agents/utils";
import type { tool as aiTool, LanguageModel, ModelMessage, StepResult } from "ai";
import type { ConversationContext } from "../../context/conversation-context";
import type { ConversationTurn, ResponseMessage } from "../../context/conversation-context.types";
import type { PromptTemplate } from "../../prompts/types";

/** Configuration for creating an LLM-backed agent via `createAgent()`. */
export interface AgentConfig {
  /** Unique name for this agent. */
  readonly name: string;
  /**
   * Model identifier in "providerID/modelID" format (e.g., `"openai/gpt-4o"`).
   * Resolved internally by `createAgent()` via the model registry and provider system.
   * Optional if a custom `execute` override is provided.
   */
  readonly model?: string;
  /**
   * System prompt sent to the model at the start of every call.
   * Accepts a static string or a `PromptTemplate` for dynamic interpolation.
   * When a `PromptTemplate` is provided, its baked-in variables are used.
   *
   * @example
   * ```ts
   * // Static string
   * const agent = createAgent({
   *   name: "writer",
   *   model: "openai/gpt-4o",
   *   systemPrompt: "You are a helpful code writer.",
   * });
   *
   * // Dynamic template
   * import { createPromptTemplate } from "@comma-agents/core";
   *
   * const agent = createAgent({
   *   name: "reviewer",
   *   model: "openai/gpt-4o",
   *   systemPrompt: createPromptTemplate({
   *     template: "You are {{ role }}, reviewing {{ language }} code.",
   *     variables: { role: "a senior engineer", language: "TypeScript" },
   *   }),
   * });
   * ```
   */
  readonly systemPrompt?: string | PromptTemplate;
  /**
   * Tool names the agent can invoke during a call.
   * Resolved internally by `createAgent()` via the tool registry.
   * Built-in tools: "bash", "read", "write", "edit", "glob", "grep".
   */
  readonly tools?: readonly string[];
  /**
   * Custom execute override — replaces the LLM call with arbitrary logic.
   *
   * When set, `model` is not required. Return a plain `string` (a synthetic
   * result with an `{ role: "assistant" }` message will be created
   * automatically) or a full `AgentCallResult` for complete control.
   *
   * @example
   * ```ts
   * const echo = createAgent({
   *   name: "echo",
   *   execute: async (message) => `Echo: ${message}`,
   * });
   * ```
   */
  readonly execute?: (message: string) => Promise<string | AgentCallResult>;
}

/**
 * The unified agent contract. Every agent — LLM-backed, human-in-the-loop,
 * flow, or custom — implements this interface.
 *
 * **Required fields** (`name`, `call`, `reset`) are the polymorphic minimum
 * that flows and orchestration depend on.
 *
 * **Optional fields** (`stream`, `getConversationContext`, `config`) are
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
 * const agent = createAgent({ name: "writer", model: "openai/gpt-4o" });
 * const context = agent.getConversationContext();   // always present on createAgent results
 * const messages = context.allMessages();            // flat ModelMessage[]
 * const turns = context.allTurns();                  // structured turns
 * for await (const event of agent.stream("Hi")) { ... }
 * ```
 */
export interface Agent {
  /** Unique name for this agent. */
  readonly name: string;

  /** The agent's configuration. */
  readonly config?: AgentConfig;

  /**
   * Call the agent with a message.
   * Runs the full hook lifecycle around the core action.
   * Returns an AbortablePromise — call `.abort()` to cancel the in-flight operation.
   */
  call(message: string): AbortablePromise<AgentCallResult>;

  // -- Optional LLM-specific fields (present on createAgent results) --

  /**
   * Stream a call, yielding events as they arrive.
   * Returns an AbortableAsyncGenerator — call `.abort()` to cancel the stream.
   */
  stream?(message: string): AbortableAsyncGenerator<AgentStreamEvent>;

  /**
   * The conversation context — all turns, messages, and context management.
   * Provides `allMessages()`, `allTurns()`, `lastTurn()`, `estimateTokens()`,
   * snapshot/restore, and iteration over turns.
   */
  getConversationContext?(): ConversationContext;

  /** Reset internal state (history, first-call flag, etc.). */
  reset(): void;

  /**
   * Append a hook callback to this agent's lifecycle.
   * Used internally by `hookIntoAgent` — not part of the public API.
   * @internal
   */
  appendHook?(hookName: string, callback: unknown): void;
}

/**
 * Result from any agent call.
 *
 * Contains the response text, token usage, finish reason, and the full
 * response message chain and step details. Non-LLM agents (mocks, flows,
 * custom execute overrides) provide empty arrays for `responseMessages`
 * and `steps`.
 *
 * @example
 * ```ts
 * const result = await agent.call("Hello");
 * console.log(result.text);               // final text
 * console.log(result.responseMessages);    // full message chain
 * console.log(result.steps);              // tool calls, reasoning, etc.
 * ```
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
  /**
   * The full assistant + tool message chain, preserving tool calls,
   * tool results, reasoning, and multi-modal content.
   * Empty array for non-LLM agents.
   */
  readonly responseMessages: readonly ResponseMessage[];
  /** All steps taken during this call (LLM calls + tool executions). Empty array for non-LLM agents. */
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
  readonly abortSignal: AbortSignal | undefined;
}
