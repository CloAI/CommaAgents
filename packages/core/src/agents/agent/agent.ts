// createAgent — Closure-based LLM agent factory.
//
// The single core factory for LLM-backed agents. Returns an Agent with
// all optional LLM fields populated (stream, getHistory, getTurns, config).
//
// State is captured in closure — no classes.

import { generateText, streamText } from "ai";
import { AgentCallError } from "../../errors/index";
import type { SideEffectHook, TransformHook } from "../../hooks";
import { runSideEffectHooks, runTransformHooks } from "../../hooks";
import { createConversationHistory } from "../../prompts/history/conversation-history";
import type { ConversationTurn, ModelMessage, ResponseMessage } from "../../prompts/types";
import type { ToolHooks } from "../hooks";
import { resolveHook } from "../hooks";
import type {
  Agent,
  AgentCallResult,
  AgentConfig,
  AgentStreamEvent,
  LLMCallResult,
} from "./agent.types";
import { buildCallOptions, buildStreamCallResult, mapStreamPart } from "./agent.utils";

// createAgent

/**
 * Create an LLM-backed agent using closure-based state management.
 *
 * Returns an `Agent` with all optional LLM fields populated (stream,
 * getHistory, getTurns, config).
 *
 * State (conversation history, first-call flag) is captured in closure.
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
export function createAgent(config: AgentConfig): Agent {
  // -- Closure state --
  const history = createConversationHistory(config.historyConfig);
  let firstCall = true;

  // Mutable hooks store — initialized from config, appendHook pushes here.
  // All hook reads go through this store (not config.hooks) so that
  // dynamically appended hooks take effect on subsequent calls.
  // Fields start as undefined (preserving resolveHook fallback semantics)
  // and become arrays when hooks are provided via config or appendHook.
  const hooks: {
    alterInitialCallMessage: Array<TransformHook<string>> | undefined;
    beforeInitialCall: Array<SideEffectHook<string>> | undefined;
    afterInitialCall: Array<SideEffectHook<string>> | undefined;
    alterInitialResponse: Array<TransformHook<string>> | undefined;
    alterCallMessage: Array<TransformHook<string>> | undefined;
    beforeCall: Array<SideEffectHook<string>> | undefined;
    afterCall: Array<SideEffectHook<string>> | undefined;
    alterResponse: Array<TransformHook<string>> | undefined;
    afterCallResult: Array<SideEffectHook<AgentCallResult>> | undefined;
    onStreamEvent: Array<SideEffectHook<AgentStreamEvent>> | undefined;
    beforeToolCall:
      | Array<SideEffectHook<{ readonly name: string; readonly args: string }>>
      | undefined;
    afterToolCall:
      | Array<
          SideEffectHook<{
            readonly name: string;
            readonly args: string;
            readonly result: string;
          }>
        >
      | undefined;
  } = {
    alterInitialCallMessage: config.hooks?.alterInitialCallMessage
      ? [...config.hooks.alterInitialCallMessage]
      : undefined,
    beforeInitialCall: config.hooks?.beforeInitialCall
      ? [...config.hooks.beforeInitialCall]
      : undefined,
    afterInitialCall: config.hooks?.afterInitialCall
      ? [...config.hooks.afterInitialCall]
      : undefined,
    alterInitialResponse: config.hooks?.alterInitialResponse
      ? [...config.hooks.alterInitialResponse]
      : undefined,
    alterCallMessage: config.hooks?.alterCallMessage
      ? [...config.hooks.alterCallMessage]
      : undefined,
    beforeCall: config.hooks?.beforeCall ? [...config.hooks.beforeCall] : undefined,
    afterCall: config.hooks?.afterCall ? [...config.hooks.afterCall] : undefined,
    alterResponse: config.hooks?.alterResponse ? [...config.hooks.alterResponse] : undefined,
    afterCallResult: config.hooks?.afterCallResult ? [...config.hooks.afterCallResult] : undefined,
    onStreamEvent: config.hooks?.onStreamEvent ? [...config.hooks.onStreamEvent] : undefined,
    beforeToolCall: config.toolHooks?.beforeToolCall
      ? [...config.toolHooks.beforeToolCall]
      : undefined,
    afterToolCall: config.toolHooks?.afterToolCall
      ? [...config.toolHooks.afterToolCall]
      : undefined,
  };

  // -- Internal helpers --

  function consumeFirstCall(): boolean {
    const wasFirstCall = firstCall;
    if (wasFirstCall) firstCall = false;
    return wasFirstCall;
  }

  /** Build a ToolHooks view from the mutable store for passing to buildCallOptions. */
  function getToolHooks(): ToolHooks {
    return {
      beforeToolCall: hooks.beforeToolCall,
      afterToolCall: hooks.afterToolCall,
    };
  }

  async function callGenerate(message: string): Promise<LLMCallResult> {
    const options = await buildCallOptions(config, message, history, getToolHooks());
    const result = await generateText(options);

    return {
      text: result.text,
      responseMessages: result.response.messages,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- AI SDK step types are complex generics
      steps: result.steps as ReadonlyArray<any>,
      usage: {
        promptTokens: result.totalUsage.inputTokens ?? 0,
        completionTokens: result.totalUsage.outputTokens ?? 0,
      },
      finishReason: result.finishReason,
    };
  }

  async function callStream(message: string): Promise<LLMCallResult> {
    const options = await buildCallOptions(config, message, history, getToolHooks());
    const result = streamText(options);
    const streamEventHooks = hooks.onStreamEvent;

    // If onStreamEvent hooks are registered, iterate the full stream to fire
    // them for each event. Otherwise just consume the stream normally.
    if (streamEventHooks && streamEventHooks.length > 0) {
      for await (const part of result.fullStream) {
        const event = mapStreamPart(part);
        if (event) {
          await runSideEffectHooks(streamEventHooks, event);
        }
      }
    }

    const response = await result.response;
    const callResult = buildStreamCallResult(
      await result.text,
      response.messages,
      await result.steps,
      await result.totalUsage,
      await result.finishReason,
    );

    // Fire the done event hook
    if (streamEventHooks && streamEventHooks.length > 0) {
      await runSideEffectHooks(streamEventHooks, {
        type: "done",
        result: callResult,
      });
    }

    return callResult;
  }

  async function execute(message: string): Promise<LLMCallResult> {
    try {
      let result: LLMCallResult;
      if (config.execute) {
        const rawExecuteResult = await config.execute(message);
        if (typeof rawExecuteResult === "string") {
          result = {
            text: rawExecuteResult,
            responseMessages: [{ role: "assistant", content: rawExecuteResult }],
            steps: [],
            usage: { promptTokens: 0, completionTokens: 0 },
            finishReason: "stop",
          };
        } else {
          result = rawExecuteResult;
        }
      } else if (config.stream) {
        result = await callStream(message);
      } else {
        result = await callGenerate(message);
      }

      // Append to conversation history — message is already the altered message.
      history.append(message, result.responseMessages);
      return result;
    } catch (error) {
      throw new AgentCallError(
        config.name,
        `LLM call failed: ${error instanceof Error ? error.message : String(error)}`,
        { cause: error },
      );
    }
  }

  // -- The agent object --

  const agent: Agent = {
    name: config.name,
    config,

    async call(message: string): Promise<LLMCallResult> {
      const isFirst = consumeFirstCall();

      // 1. Alter message
      const alteredMessage = await runTransformHooks(
        resolveHook(hooks.alterInitialCallMessage, hooks.alterCallMessage, isFirst),
        message,
      );
      // 2. Before call
      await runSideEffectHooks(
        resolveHook(hooks.beforeInitialCall, hooks.beforeCall, isFirst),
        alteredMessage,
      );
      // 3. Execute
      const result = await execute(alteredMessage);
      // 4. After call (text only — legacy)
      await runSideEffectHooks(
        resolveHook(hooks.afterInitialCall, hooks.afterCall, isFirst),
        result.text,
      );
      // 5. After call result (full result with usage)
      await runSideEffectHooks(hooks.afterCallResult, result);
      // 6. Alter response
      const alteredText = await runTransformHooks(
        resolveHook(hooks.alterInitialResponse, hooks.alterResponse, isFirst),
        result.text,
      );

      return { ...result, text: alteredText };
    },

    async *stream(message: string): AsyncGenerator<AgentStreamEvent> {
      if (config.execute) {
        throw new Error(
          `Agent "${config.name}" uses a custom execute override and does not support streaming.`,
        );
      }

      const isFirst = consumeFirstCall();

      const alteredMessage = await runTransformHooks(
        resolveHook(hooks.alterInitialCallMessage, hooks.alterCallMessage, isFirst),
        message,
      );
      await runSideEffectHooks(
        resolveHook(hooks.beforeInitialCall, hooks.beforeCall, isFirst),
        alteredMessage,
      );

      const options = await buildCallOptions(config, alteredMessage, history, getToolHooks());
      const streamResult = streamText(options);
      const streamEventHooks = hooks.onStreamEvent;

      for await (const part of streamResult.fullStream) {
        const event = mapStreamPart(part);
        if (event) {
          if (streamEventHooks && streamEventHooks.length > 0) {
            await runSideEffectHooks(streamEventHooks, event);
          }
          yield event;
        }
      }

      const text = await streamResult.text;
      const steps = await streamResult.steps;
      const totalUsage = await streamResult.totalUsage;
      const response = await streamResult.response;
      const responseMessages: readonly ResponseMessage[] = response.messages;

      await runSideEffectHooks(resolveHook(hooks.afterInitialCall, hooks.afterCall, isFirst), text);

      // afterCallResult — full result with usage for token tracking
      const streamCallResult = buildStreamCallResult(
        text,
        responseMessages,
        steps,
        totalUsage,
        await streamResult.finishReason,
      );
      await runSideEffectHooks(hooks.afterCallResult, streamCallResult);

      const alteredText = await runTransformHooks(
        resolveHook(hooks.alterInitialResponse, hooks.alterResponse, isFirst),
        text,
      );

      history.append(alteredMessage, responseMessages);

      const doneEvent: AgentStreamEvent = {
        type: "done",
        result: { ...streamCallResult, text: alteredText },
      };

      if (streamEventHooks && streamEventHooks.length > 0) {
        await runSideEffectHooks(streamEventHooks, doneEvent);
      }

      yield doneEvent;
    },

    getHistory(): readonly ModelMessage[] {
      return history.toMessages();
    },

    getTurns(): readonly ConversationTurn[] {
      return history.getTurns();
    },

    /** Append a hook callback to this agent's lifecycle. */
    appendHook(hookName: string, callback: unknown): void {
      if (!(hookName in hooks)) {
        throw new Error(`Unknown hook name: "${hookName}"`);
      }
      const hookStoreKey = hookName as keyof typeof hooks;
      const existingHooks = hooks[hookStoreKey];
      if (existingHooks) {
        (existingHooks as unknown[]).push(callback);
      } else {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any -- dynamic hook store
        (hooks as any)[hookStoreKey] = [callback];
      }
    },

    reset(): void {
      firstCall = true;
      history.clear();
    },
  };

  return agent;
}
