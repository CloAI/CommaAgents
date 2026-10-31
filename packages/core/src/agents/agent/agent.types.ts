import type {
  CallSettings,
  FlexibleSchema,
  LanguageModel,
  ModelMessage,
  StepResult,
  stepCountIs,
  streamText,
  ToolChoice,
  ToolSet,
} from "ai";
import type {
  AbortableAsyncGenerator,
  AbortablePromise,
} from "../../abortable";
import type {
  ContextUsage,
  ConversationContext,
  ConversationContextOptions,
  ConversationRetentionEvent,
  ResponseMessage,
} from "../../conversation-context";
import type { LanguageService } from "../../language";
import type { McpToolOrigin } from "../../mcp";
import type { PromptTemplate, TemplateVariables } from "../../prompts";
import type { Sandbox } from "../../sandbox/sandbox.types";
import type { SkillRegistry } from "../../skills/skills.types";
import type { SubagentTarget } from "../../tools/built-in/delegate/delegate.types";
import type { StrategySwitchHandle } from "../../tools/built-in/request-strategy-switch/request-strategy-switch.types";
import type { LaunchStrategyHandle } from "../../tools/launch-strategy.types";
import type { QuestionRequester } from "../../tools/tool.types";
import type { InputCollector } from "../built-in/user/user-agent.types";
import type {
  PrivacyRequirements,
  PrivacyRuntime,
  PrivacyReport,
} from "../../model/privacy";

/**
 * Provider-independent generation settings for an agent.
 *
 * Use {@link AgentConfig.providerOptions} for provider-specific capabilities
 * such as extended thinking or reasoning effort.
 */
export type ModelOptions = Pick<
  CallSettings,
  | "temperature"
  | "topP"
  | "topK"
  | "maxOutputTokens"
  | "maxRetries"
  | "frequencyPenalty"
  | "presencePenalty"
  | "seed"
>;

/** Schema used to constrain and validate an agent's structured output. */
export type AgentOutputSchema = FlexibleSchema<unknown>;

/**
 * Runtime services available to an agent and its tools.
 *
 * @example
 * ```ts
 * const agent = createAgent(
 *   { name: "writer", model: "openai/gpt-4o", tools: ["read_file"] },
 *   { sandbox, runId: crypto.randomUUID() },
 * );
 * ```
 */
export interface AgentRuntime {
  /** Trusted runtime used to enforce protected model inference. */
  readonly privacyRuntime?: PrivacyRuntime;
  /** Current invocation identity supplied to tools by the agent. */
  readonly messageId?: string;
  /** Access controls applied to tools invoked by this agent. */
  readonly sandbox?: Sandbox;
  /** Skills available to the `list_skills` and `load_skill` tools. */
  readonly skillRegistry?: SkillRegistry;
  /** Identifier shared with tools for the current strategy invocation. */
  readonly runId?: string;
  /** User-input callback available to interactive tools and child strategies. */
  readonly inputCollector?: InputCollector;
  /** Runtime callback used by `launch_strategy` to run a child strategy. */
  readonly launchStrategy?: LaunchStrategyHandle;
  /** Workspace language service available to language-aware tools. */
  readonly languageService?: LanguageService;
  /** Callback used by tools that request clarification from the user. */
  readonly questionRequester?: QuestionRequester;
  /** Connected MCP tools available to this agent for the current run. */
  readonly mcpTools?: Readonly<ToolSet>;
  /** Subagent strategies this agent may use through the `delegate` tool. */
  readonly subagents?: readonly SubagentTarget[];
  /** Runtime handle that queues a user-approved strategy switch for this conversation. */
  readonly requestStrategySwitch?: StrategySwitchHandle;
}

/** Configuration for creating a model-backed agent or a custom executable agent. */
export interface AgentConfig {
  /** Required inference protections, also inherited by automatic summarization. */
  readonly privacy?: PrivacyRequirements;
  /** Unique name for this agent. */
  readonly name: string;
  /**
   * Model identifier in `"providerID/modelID"` format, such as
   * `"openai/gpt-4o"`, or a bare model ID that can be resolved from the catalog.
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
  /** Names of built-in or registered tools the agent can invoke. */
  readonly tools?: readonly string[];
  /**
   * Provider-specific settings applied to every model call, such as reasoning
   * effort or extended thinking.
   *
   * @example
   * ```ts
   * createAgent({
   *   name: "planner",
   *   model: "anthropic/claude-sonnet-4-5",
   *   providerOptions: {
   *     anthropic: { thinking: { type: "enabled", budgetTokens: 8000 } },
   *   },
   * });
   * ```
   */
  readonly providerOptions?: Record<string, Record<string, unknown>>;
  /**
   * Provider-independent generation settings applied to every model call,
   * including temperature, output limits, sampling, and retry behavior.
   *
   * @example
   * ```ts
   * createAgent({
   *   name: "creative-writer",
   *   model: "openai/gpt-4o",
   *   modelOptions: { temperature: 0.9, maxOutputTokens: 4096 },
   * });
   * ```
   */
  readonly modelOptions?: ModelOptions;
  /**
   * Schema that constrains and validates structured model output.
   * Programmatic callers can use a Zod schema; declarative agent and strategy
   * files accept a JSON Schema object.
   */
  readonly outputSchema?: AgentOutputSchema;
  /**
   * Maximum number of LLM round-trips (steps) per call.
   * Each tool-call + response counts as one step.
   * @default 100
   */
  readonly maxSteps?: number;
  /**
   * Custom execution function used instead of a model call.
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
  /**
   * Conversation retention and compaction options. Records removed from the
   * model-visible context remain available when exporting full history.
   *
   * YAML/JSON definitions can use serializable `rollingWindow` and
   * `compaction` values. Programmatic callers may also pass `transformRecords`
   * for custom behavior.
   *
   * @example
   * ```ts
   * createAgent({
   *   name: "writer",
   *   model: "anthropic/claude-opus-4-8",
   *   context: { rollingWindow: 40, compaction: { keepRecent: 8 } },
   * });
   * ```
   */
  readonly context?: ConversationContextOptions;
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
 * const messages = context.messages();               // flat ModelMessage[]
 * const records = context.records();                 // structured records
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

  /**
   * Interrupt the selected active response and resume the same agent with a correction.
   * Returns false for a stale identity, empty correction, or a non-model agent.
   * The optional callback saves accepted input before the agent resumes; write failures fail the call.
   */
  steer?(
    messageId: string,
    text: string,
    beforeResume?: () => Promise<void>,
  ): boolean;

  // -- Optional LLM-specific fields (present on createAgent results) --

  /**
   * Stream a call, yielding events as they arrive.
   * Returns an AbortableAsyncGenerator — call `.abort()` to cancel the stream.
   */
  stream?(message: string): AbortableAsyncGenerator<AgentStreamEvent>;

  /**
   * The agent's internal conversation context.
   * Provides canonical conversation records, message projection, and import/export helpers.
   */
  getConversationContext?(): ConversationContext;

  /** Reset internal state (history, first-call flag, etc.). */
  reset(): void;

  /**
   * Update variables used by this agent's prompt template.
   *
   * When the agent was configured with a `PromptTemplate` (via
   * `systemPrompt`), calling this merges new variables into the template's
   * defaults — matching keys are overwritten, the rest are kept.
   * If the agent uses a static string prompt, this is a no-op.
   *
   * @example
   * ```ts
   * const agent = createAgent({
   *   name: "reviewer",
   *   model: "openai/gpt-4o",
   *   systemPrompt: createPromptTemplate({
   *     template: "You are {{ role }}, reviewing {{ language }} code.",
   *     variables: { role: "a reviewer" },
   *   }),
   * });
   *
   * agent.updatePromptVariables({ language: "TypeScript" });
   * // Next call renders: "You are a reviewer, reviewing TypeScript code."
   * ```
   */
  updatePromptVariables?(variables: TemplateVariables): void;

  /**
   * Append a hook callback to this agent's lifecycle.
   * Used internally by `hookIntoAgent` — not part of the public API.
   * @internal
   */
  appendHook?(hookName: string, callback: unknown): void;
}

/** Stable identity shared by streaming, persisted conversation, and display history. */
export interface AgentCallIdentity {
  /** Identifier allocated before execution begins. */
  readonly messageId: string;
  /** ISO timestamp at call start. */
  readonly createdAt: string;
}

/** Failure of an identified agent invocation. */
export interface AgentCallFailure extends AgentCallIdentity {
  /** Failure raised while processing this invocation. */
  readonly error: unknown;
  /** Whether cancellation was requested when the failure was observed. */
  readonly cancelled: boolean;
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
  /** Content-free verification reports from every model request in this invocation. */
  readonly privacyReports?: readonly PrivacyReport[];
  /** Conversation-record identity, when supplied by the agent implementation. */
  readonly messageId?: string;
  /** Invocation start time, when supplied by the agent implementation. */
  readonly createdAt?: string;
  /** The final text response from the agent. */
  readonly text: string;
  /** Total token usage across all steps. Zero for non-LLM agents. */
  readonly usage: {
    readonly promptTokens: number;
    readonly completionTokens: number;
  };
  /** Final model-step context usage. */
  readonly contextUsage?: ContextUsage;
  /** Why the agent stopped (e.g., "stop", "tool-calls", "length"). */
  readonly finishReason: string;
  /**
   * The full assistant + tool message chain, preserving tool calls,
   * tool results, reasoning, and multi-modal content.
   * Empty array for non-LLM agents.
   */
  readonly responseMessages: readonly ResponseMessage[];
  /** All steps taken during this call (LLM calls + tool executions). Empty array for non-LLM agents. */
  readonly steps: ReadonlyArray<StepResult<ToolSet>>;
}

/**
 * Event emitted during a streaming agent call.
 *
 * Reasoning ("thinking") events come in three parts mirroring the AI SDK
 * v6 stream: `thinking-start` opens a reasoning block, zero or more
 * `thinking` deltas append text to it, and `thinking-end` closes it. The
 * `id` is supplied by the model and lets multiple interleaved reasoning
 * blocks within a single step be reassembled correctly downstream.
 */
/**
 * Lifecycle status of a tool invocation. `running` is implicit (no
 * `tool-result` has been emitted yet for the matching `toolCallId`);
 * `completed` and `error` arrive on the `tool-result` event.
 */
export type ToolCallStatus = "completed" | "error";

export type AgentStreamEvent = Partial<AgentCallIdentity> &
  (
    | { readonly type: "retention"; readonly event: ConversationRetentionEvent }
    | { readonly type: "text"; readonly text: string }
    | {
        readonly type: "tool-call";
        /**
         * Correlation id assigned by the model. Pairs this call with its eventual
         * `tool-result` event so consumers can render a single row per call
         * even when calls run concurrently or interleave with text/thinking.
         */
        readonly toolCallId: string;
        readonly toolName: string;
        readonly args: string;
        /** MCP origin when this is a namespaced MCP tool. */
        readonly mcp?: McpToolOrigin;
      }
    | {
        readonly type: "tool-result";
        /** Correlates with the `tool-call` event that started this invocation. */
        readonly toolCallId: string;
        readonly toolName: string;
        /**
         * Raw tool output. For `status: "error"` results this is an empty
         * string by default — the human-readable failure message lives on
         * `error`.
         */
        readonly output: string;
        /** Outcome of the tool invocation. */
        readonly status: ToolCallStatus;
        /** User steering requested cancellation of this running tool. */
        readonly cancellationRequestedBy?: "user_steering";
        /** The tool stopped because of user steering. */
        readonly cancellationReason?: "user_steering";
        /** Failure message when `status === "error"`. */
        readonly error?: string;
        /** MCP origin when this is a namespaced MCP tool. */
        readonly mcp?: McpToolOrigin;
      }
    | { readonly type: "thinking-start"; readonly id: string }
    | { readonly type: "thinking"; readonly id: string; readonly text: string }
    | { readonly type: "thinking-end"; readonly id: string }
    | { readonly type: "step-start" }
    | { readonly type: "done"; readonly result: AgentCallResult }
  );

/** Common options passed to generateText / streamText. */
export interface CallOptions {
  readonly model: LanguageModel;
  readonly system?: string | ModelMessage | ModelMessage[];
  readonly messages: ModelMessage[];
  readonly tools?: ToolSet | undefined;
  readonly toolChoice?: ToolChoice<ToolSet> | undefined;
  readonly abortSignal?: AbortSignal | undefined;
  readonly timeout?: number | undefined;
  readonly stopWhen?: ReturnType<typeof stepCountIs>;
  /**
   * Per-call provider options forwarded verbatim to `streamText`.
   */
  readonly providerOptions?: unknown;
  /** Structured output specification forwarded to `streamText`. */
  readonly output?: Parameters<typeof streamText>[0]["output"];
  /**
   * Model-level generation parameters forwarded to `streamText`.
   */
  readonly modelOptions?: ModelOptions;
}

/** Prepared model-call options plus retention events emitted before the call. */
export interface BuildCallOptionsResult {
  /** AI SDK call options passed to `streamText`. */
  readonly callOptions: CallOptions;
  /** Retention events emitted while preparing conversation context. */
  readonly retentionEvents: readonly ConversationRetentionEvent[];
}

/** One queued correction and the durable write that must precede resumption. @internal */
export interface PendingAgentSteering {
  /** Correction supplied by the user. */
  readonly text: string;
  /** Accepted input must be durable before resumption. */
  readonly persisted: Promise<void>;
}

/** A model generation segment that can be interrupted independently of its flow. @internal */
export interface ActiveAgentGeneration {
  /** Cancellation of this response, independent of the owning call. */
  readonly controller: AbortController;
  /** Corrections in acceptance order. */
  readonly steering: PendingAgentSteering[];
  /** Whether this identity still accepts corrections. */
  accepting: boolean;
}
