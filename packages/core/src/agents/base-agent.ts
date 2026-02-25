// BaseAgent — LLM-backed agent using the Vercel AI SDK.
//
// Implements the Agent interface. Uses withAgentHooks() for the shared
// hook lifecycle. Manages conversation history and tool execution.
// Uses the prompt module for message building and system prompt resolution.

import type { LanguageModel, StepResult } from "ai";
import { tool as aiTool, generateText, stepCountIs, streamText } from "ai";
import { AgentCallError } from "../errors/index";
import type { AgentHooks, ToolHooks } from "../hooks/types";
import { runSideEffectHooks } from "../hooks/types";
import { ConversationHistory } from "../prompts/history/conversation-history";
import { buildMessages, resolveSystemPrompt } from "../prompts/message-builder";
import type {
  ChatMessage,
  ConversationHistoryConfig,
  ConversationTurn,
  PromptTemplate,
  TemplateVariables,
} from "../prompts/types";
import type { ToolContext, ToolDef, ToolResult } from "../tools/tool";
import { withAgentHooks } from "./hooks";
import type { Agent, AgentCallResult, AgentStreamEvent } from "./types";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Configuration for creating a BaseAgent. */
export interface AgentConfig {
  /** Unique name for this agent. */
  readonly name: string;
  /** AI SDK language model instance (e.g., `openai("gpt-4o")`). */
  readonly model: LanguageModel;
  /**
   * System prompt sent to the model at the start of every call.
   * For dynamic system prompts with variable interpolation, use `systemPromptTemplate` instead.
   */
  readonly systemPrompt?: string;
  /**
   * Dynamic system prompt template with `{variable}` interpolation.
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
   *     template: "You are {role}, reviewing {language} code.",
   *     variables: { role: "a senior engineer", language: "TypeScript" },
   *   }),
   * });
   * ```
   */
  readonly systemPromptTemplate?: PromptTemplate;
  /** Override variables for the system prompt template (per-agent overrides). */
  readonly templateOverrides?: TemplateVariables;
  /** Tools the agent can invoke during a call. Keys become tool names. */
  readonly tools?: Readonly<Record<string, ToolDef>>;
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
  /** Nucleus sampling parameter. */
  readonly topP?: number;
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
   */
  readonly prefixMessages?: readonly ChatMessage[];
}

// ---------------------------------------------------------------------------
// Default constants
// ---------------------------------------------------------------------------

const DEFAULT_MAX_STEPS = 10;

// ---------------------------------------------------------------------------
// BaseAgent
// ---------------------------------------------------------------------------

/**
 * An LLM-backed agent that can call tools and participate in flows.
 *
 * Uses the Vercel AI SDK (`generateText` / `streamText`) under the hood.
 * Implements the `Agent` interface so it can be used in any flow.
 * The hook lifecycle is handled by `withAgentHooks()` middleware.
 *
 * Conversation history is managed by `ConversationHistory` with configurable
 * windowing and truncation strategies.
 *
 * For most use cases, prefer the `createAgent()` factory function.
 * Use the class directly when you need access to `getHistory()`, `stream()`,
 * or direct `ConversationHistory` access.
 *
 * @example
 * ```ts
 * import { createAgent } from "@comma-agents/core";
 * import { openai } from "@ai-sdk/openai";
 *
 * const agent = createAgent({
 *   name: "writer",
 *   model: openai("gpt-4o"),
 *   systemPrompt: "You are a helpful code writer.",
 *   historyConfig: { maxTurns: 20 },
 * });
 *
 * const result = await agent.call("Write a hello world in TypeScript");
 * console.log(result.text);
 * ```
 */
export class BaseAgent implements Agent {
  readonly name: string;
  readonly config: AgentConfig;

  /** The conversation history manager. */
  readonly history: ConversationHistory;

  private _firstCall = true;

  /** The hook-wrapped execute function. */
  private readonly _hookedCall: (
    message: string,
    isFirst: boolean,
  ) => Promise<{ readonly result: AgentCallResult; readonly alteredMessage: string }>;

  constructor(config: AgentConfig) {
    this.name = config.name;
    this.config = config;
    this.history = new ConversationHistory(config.historyConfig);

    // Wire up the hook middleware around our LLM execute function.
    this._hookedCall = withAgentHooks(config.hooks, (msg) => this._execute(msg));
  }

  /**
   * Call the agent with a message. Runs the full hook lifecycle:
   *   alterCallMessage → beforeCall → [LLM call] → afterCall → alterResponse
   *
   * On the first call, `initial*` hook variants are used (with fallback to base hooks).
   */
  async call(message: string): Promise<AgentCallResult> {
    const isFirst = this._firstCall;
    if (isFirst) {
      this._firstCall = false;
    }

    const { result, alteredMessage } = await this._hookedCall(message, isFirst);

    // Update conversation history
    this.history.append(alteredMessage, result.text);

    return result;
  }

  /**
   * Stream a call to the agent. Yields events as they arrive.
   * Runs the same hook lifecycle as `call()`.
   *
   * Note: Hooks run at the boundaries (alter message before, alter response after).
   * Streaming events are yielded between the before and after hooks.
   */
  async *stream(message: string): AsyncGenerator<AgentStreamEvent> {
    const isFirst = this._firstCall;
    if (isFirst) {
      this._firstCall = false;
    }

    // We run the alter/before hooks manually here because streaming
    // needs to yield events between before and after.
    const { runAlterMessageHooks, runBeforeCallHooks, runAfterCallHooks, runAlterResponseHooks } =
      await import("./hooks");

    const alteredMessage = await runAlterMessageHooks(this.config.hooks, message, isFirst);
    await runBeforeCallHooks(this.config.hooks, alteredMessage, isFirst);

    const tools = this._buildToolSet();
    const messages = this._buildMessages(alteredMessage);
    const systemPrompt = await this._resolveSystemPrompt();

    const streamResult = streamText({
      model: this.config.model,
      system: systemPrompt,
      messages,
      tools,
      stopWhen: stepCountIs(this.config.maxSteps ?? DEFAULT_MAX_STEPS),
      temperature: this.config.temperature,
      topP: this.config.topP,
      abortSignal: this.config.abort,
    });

    const streamEventHooks = this.config.hooks?.onStreamEvent;

    for await (const part of streamResult.fullStream) {
      let event: AgentStreamEvent | undefined;
      switch (part.type) {
        case "text-delta":
          event = { type: "text", text: part.text };
          break;
        case "tool-call":
          event = {
            type: "tool-call",
            toolName: part.toolName,
            args: JSON.stringify(part.args),
          };
          break;
        case "tool-result":
          event = {
            type: "tool-result",
            toolName: part.toolName,
            output: typeof part.result === "string" ? part.result : JSON.stringify(part.result),
          };
          break;
        case "start-step":
          event = { type: "step-start" };
          break;
      }
      if (event) {
        // Fire onStreamEvent hooks alongside each yield
        if (streamEventHooks && streamEventHooks.length > 0) {
          await runSideEffectHooks(streamEventHooks, event);
        }
        yield event;
      }
    }

    const text = await streamResult.text;
    const steps = await streamResult.steps;
    const totalUsage = await streamResult.totalUsage;

    await runAfterCallHooks(this.config.hooks, text, isFirst);
    const alteredText = await runAlterResponseHooks(this.config.hooks, text, isFirst);

    // Update conversation history
    this.history.append(alteredMessage, alteredText);

    const doneEvent: AgentStreamEvent = {
      type: "done",
      result: {
        text: alteredText,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any -- AI SDK step types are complex generics
        steps: steps as ReadonlyArray<StepResult<any>>,
        usage: {
          promptTokens: totalUsage.inputTokens,
          completionTokens: totalUsage.outputTokens,
        },
        finishReason: (await streamResult.finishReason) ?? "stop",
      },
    };

    // Fire onStreamEvent hooks for the done event too
    if (streamEventHooks && streamEventHooks.length > 0) {
      await runSideEffectHooks(streamEventHooks, doneEvent);
    }

    yield doneEvent;
  }

  /**
   * Returns a copy of the conversation history as message pairs.
   * For more control, access `agent.history` directly.
   */
  getHistory(): ReadonlyArray<{
    readonly role: "user" | "assistant";
    readonly content: string;
  }> {
    return this.history.toMessages();
  }

  /**
   * Returns the conversation turns (user+assistant pairs).
   * Convenience wrapper around `agent.history.getTurns()`.
   */
  getTurns(): readonly ConversationTurn[] {
    return this.history.getTurns();
  }

  /** Clears the conversation history and resets first-call state. */
  reset(): void {
    this.history.clear();
    this._firstCall = true;
  }

  // ---------------------------------------------------------------------------
  // Private: System prompt resolution
  // ---------------------------------------------------------------------------

  /**
   * Resolve the system prompt, supporting both static strings and templates.
   */
  private async _resolveSystemPrompt(): Promise<string | undefined> {
    return resolveSystemPrompt({
      systemPrompt: this.config.systemPrompt,
      systemPromptTemplate: this.config.systemPromptTemplate,
      templateOverrides: this.config.templateOverrides,
    });
  }

  // ---------------------------------------------------------------------------
  // Private: Core execute (LLM call)
  // ---------------------------------------------------------------------------

  /**
   * Execute the LLM call. This is the function wrapped by withAgentHooks.
   * Receives the already-altered message.
   */
  private async _execute(message: string): Promise<AgentCallResult> {
    try {
      if (this.config.stream) {
        return await this._callStream(message);
      }
      return await this._callGenerate(message);
    } catch (error) {
      throw new AgentCallError(
        this.name,
        `LLM call failed: ${error instanceof Error ? error.message : String(error)}`,
        { cause: error },
      );
    }
  }

  private async _callGenerate(message: string): Promise<AgentCallResult> {
    const tools = this._buildToolSet();
    const messages = this._buildMessages(message);
    const systemPrompt = await this._resolveSystemPrompt();

    const result = await generateText({
      model: this.config.model,
      system: systemPrompt,
      messages,
      tools,
      stopWhen: stepCountIs(this.config.maxSteps ?? DEFAULT_MAX_STEPS),
      temperature: this.config.temperature,
      topP: this.config.topP,
      abortSignal: this.config.abort,
    });

    return {
      text: result.text,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- AI SDK step types are complex generics
      steps: result.steps as ReadonlyArray<StepResult<any>>,
      usage: {
        promptTokens: result.totalUsage.inputTokens,
        completionTokens: result.totalUsage.outputTokens,
      },
      finishReason: result.finishReason,
    };
  }

  private async _callStream(message: string): Promise<AgentCallResult> {
    const tools = this._buildToolSet();
    const messages = this._buildMessages(message);
    const systemPrompt = await this._resolveSystemPrompt();

    const result = streamText({
      model: this.config.model,
      system: systemPrompt,
      messages,
      tools,
      stopWhen: stepCountIs(this.config.maxSteps ?? DEFAULT_MAX_STEPS),
      temperature: this.config.temperature,
      topP: this.config.topP,
      abortSignal: this.config.abort,
    });

    const streamEventHooks = this.config.hooks?.onStreamEvent;

    // If onStreamEvent hooks are registered, iterate the full stream to fire
    // them for each event. Otherwise just consume the stream normally.
    if (streamEventHooks && streamEventHooks.length > 0) {
      for await (const part of result.fullStream) {
        let event: AgentStreamEvent | undefined;
        switch (part.type) {
          case "text-delta":
            event = { type: "text", text: part.text };
            break;
          case "tool-call":
            event = {
              type: "tool-call",
              toolName: part.toolName,
              args: JSON.stringify(part.args),
            };
            break;
          case "tool-result":
            event = {
              type: "tool-result",
              toolName: part.toolName,
              output: typeof part.result === "string" ? part.result : JSON.stringify(part.result),
            };
            break;
          case "start-step":
            event = { type: "step-start" };
            break;
        }
        if (event) {
          await runSideEffectHooks(streamEventHooks, event);
        }
      }
    }

    // Consume the stream to get the final result
    const text = await result.text;
    const steps = await result.steps;
    const totalUsage = await result.totalUsage;

    const callResult: AgentCallResult = {
      text,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- AI SDK step types are complex generics
      steps: steps as ReadonlyArray<StepResult<any>>,
      usage: {
        promptTokens: totalUsage.inputTokens,
        completionTokens: totalUsage.outputTokens,
      },
      finishReason: (await result.finishReason) ?? "stop",
    };

    // Fire the done event hook
    if (streamEventHooks && streamEventHooks.length > 0) {
      await runSideEffectHooks(streamEventHooks, { type: "done", result: callResult });
    }

    return callResult;
  }

  // ---------------------------------------------------------------------------
  // Private: Build AI SDK tools from our ToolDef map
  // ---------------------------------------------------------------------------

  /**
   * Converts our ToolDef map into the AI SDK's tool format.
   * Wraps each tool's execute with our ToolHooks (beforeToolCall / afterToolCall).
   */
  private _buildToolSet(): Record<string, ReturnType<typeof aiTool>> | undefined {
    const toolDefs = this.config.tools;
    if (!toolDefs || Object.keys(toolDefs).length === 0) {
      return undefined;
    }

    const toolSet: Record<string, ReturnType<typeof aiTool>> = {};

    for (const [name, def] of Object.entries(toolDefs)) {
      toolSet[name] = aiTool({
        description: def.description,
        inputSchema: def.parameters,
        execute: async (args, options) => {
          const argsStr = JSON.stringify(args);

          // Before tool call hooks
          await runSideEffectHooks(this.config.toolHooks?.beforeToolCall, {
            name,
            args: argsStr,
          });

          // Execute the tool
          const ctx: ToolContext = {
            agentName: this.name,
            abort: options.abortSignal ?? AbortSignal.timeout(30_000),
          };

          const result: ToolResult = await def.execute(args, ctx);

          // After tool call hooks
          await runSideEffectHooks(this.config.toolHooks?.afterToolCall, {
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

  // ---------------------------------------------------------------------------
  // Private: Message building
  // ---------------------------------------------------------------------------

  /**
   * Build the message array for the AI SDK call.
   * Uses the prompt module's `buildMessages()` utility with conversation history.
   */
  private _buildMessages(currentMessage: string): readonly ChatMessage[] {
    return buildMessages({
      message: currentMessage,
      history: this.history,
      prefix: this.config.prefixMessages,
    });
  }
}

// ---------------------------------------------------------------------------
// createAgent — convenience factory
// ---------------------------------------------------------------------------

/**
 * Create an LLM-backed agent.
 *
 * Returns a `BaseAgent` instance which implements the `Agent` interface.
 * Use this factory in most cases. Access `BaseAgent` directly when you
 * need `getHistory()`, `stream()`, or direct `history` access.
 *
 * @example
 * ```ts
 * const agent = createAgent({
 *   name: "writer",
 *   model: openai("gpt-4o"),
 *   systemPrompt: "You are a helpful assistant.",
 *   historyConfig: { maxTurns: 20 },
 * });
 *
 * const result = await agent.call("Hello");
 * ```
 */
export function createAgent(config: AgentConfig): BaseAgent {
  return new BaseAgent(config);
}
