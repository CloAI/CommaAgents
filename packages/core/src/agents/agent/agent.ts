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
import type { ConversationTurn, ModelMessage } from "../../prompts/types";
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
 *
 * const agent = createAgent({
 *   name: "writer",
 *   model: "openai/gpt-4o",
 *   systemPrompt: "You are a helpful code writer.",
 * });
 *
 * const result = await agent.call("Write a hello world in TypeScript");
 * console.log(result.text);
 * ```
 */
export function createAgent(config: AgentConfig): Agent {
  // -- Closure state --
  const history = createConversationHistory();
  let firstCall = true;

  // Mutable hooks store — starts empty, populated via appendHook (hookIntoAgent).
  // All hook reads go through this store so that dynamically appended hooks
  // take effect on subsequent calls.
  // Fields start as undefined (preserving resolveHook fallback semantics)
  // and become arrays when hooks are appended via hookIntoAgent.
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
    alterInitialCallMessage: undefined,
    beforeInitialCall: undefined,
    afterInitialCall: undefined,
    alterInitialResponse: undefined,
    alterCallMessage: undefined,
    beforeCall: undefined,
    afterCall: undefined,
    alterResponse: undefined,
    afterCallResult: undefined,
    onStreamEvent: undefined,
    beforeToolCall: undefined,
    afterToolCall: undefined,
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

  /**
   * Core streaming generator — yields mapped AgentStreamEvents from a
   * streamText result, fires onStreamEvent hooks for each event, builds
   * the final LLMCallResult, fires the "done" hook, and yields the done
   * event last.
   *
   * Both `callStream` (internal, promise-based) and `stream()` (public,
   * generator-based) delegate here to avoid duplicating the iteration,
   * mapping, result-building, and hook-firing logic.
   */
  async function* runStream(message: string): AsyncGenerator<AgentStreamEvent, LLMCallResult> {
    const options = await buildCallOptions(config, message, history, getToolHooks());
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

    const callResult = buildStreamCallResult(
      await streamResult.text,
      (await streamResult.response).messages,
      await streamResult.steps,
      await streamResult.totalUsage,
      await streamResult.finishReason,
    );

    const doneEvent: AgentStreamEvent = {
      type: "done",
      result: callResult,
    };

    if (streamEventHooks && streamEventHooks.length > 0) {
      await runSideEffectHooks(streamEventHooks, doneEvent);
    }

    yield doneEvent;
    return callResult;
  }

  /** Consume the stream generator internally, returning only the final result. */
  async function callStream(message: string): Promise<LLMCallResult> {
    const generator = runStream(message);
    let iteratorResult = await generator.next();
    while (!iteratorResult.done) {
      iteratorResult = await generator.next();
    }
    return iteratorResult.value;
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

      // 3. Stream — delegate to the shared generator, re-yielding all
      //    non-done events. The done event is intercepted so we can run
      //    post-call hooks and apply response alteration before yielding.
      const generator = runStream(alteredMessage);
      let callResult: LLMCallResult | undefined;

      for await (const event of generator) {
        if (event.type === "done") {
          callResult = event.result as LLMCallResult;
        } else {
          yield event;
        }
      }

      // Safety — callResult is always set because runStream always yields a done event.
      const result = callResult!;

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

      history.append(alteredMessage, result.responseMessages);

      yield {
        type: "done",
        result: { ...result, text: alteredText },
      };
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
