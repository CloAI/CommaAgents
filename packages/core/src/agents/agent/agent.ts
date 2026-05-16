import type {
  AbortableAsyncGenerator,
  AbortablePromise,
} from "@comma-agents/utils";
import {
  createAbortableGenerator,
  createAbortablePromise,
} from "@comma-agents/utils";
import { streamText } from "ai";
import { createConversationContext } from "../../context/conversation-context";
import { AgentCallError } from "../../errors/index";
import type { SideEffectHook, TransformHook } from "../../hooks";
import { runSideEffectHooks, runTransformHooks } from "../../hooks";
import type { TemplateVariables } from "../../prompts/types";
import type { ToolHooks } from "../hooks";
import { resolveHook } from "../hooks";
import type {
  Agent,
  AgentCallResult,
  AgentConfig,
  AgentStreamEvent,
} from "./agent.types";
import {
  buildCallOptions,
  buildStreamCallResult,
  mapStreamPart,
} from "./agent.utils";

/**
 * Create an LLM-backed agent using closure-based state management.
 *
 * Returns an `Agent` with all optional LLM fields populated (stream,
 * getConversationContext, config).
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
  const context = createConversationContext();
  let firstCall = true;

  // Mutable hooks store — starts empty, populated via appendHook (hookIntoAgent).
  // All hook reads go through this store so that dynamically appended hooks
  // take effect on subsequent calls.
  // Fields start as undefined (preserving resolveHook fallback semantics)
  // and become arrays when hooks are appended via hookIntoAgent.
  const hooks: {
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
    alterFirstCallMessage: undefined,
    beforeFirstCall: undefined,
    afterFirstCallResult: undefined,
    alterFirstResponse: undefined,
    alterCallMessage: undefined,
    beforeCall: undefined,
    alterResponse: undefined,
    afterCallResult: undefined,
    onStreamEvent: undefined,
    beforeToolCall: undefined,
    afterToolCall: undefined,
  };

  // Internal helpers

  function consumeFirstCall(): boolean {
    const wasFirstCall = firstCall;
    if (wasFirstCall) firstCall = false;
    return wasFirstCall;
  }

  // TODO: I really feel like these get*Hooks could really just be pure util
  // functions, not sure if they really need to be per object.

  /** Build a ToolHooks view from the mutable store for passing to buildCallOptions. */
  function getToolHooks(): ToolHooks {
    return {
      beforeToolCall: hooks.beforeToolCall,
      afterToolCall: hooks.afterToolCall,
    };
  }

  /**
   * Run the pre-call hook lifecycle (steps 1-2) and return the altered
   * message and the first-call flag. Shared by both `call()` (execute
   * override path) and `stream()` (LLM path).
   */
  async function runPreCallHooks(
    message: string,
    isFirst: boolean,
  ): Promise<string> {
    // 1. Alter message
    const alteredMessage = await runTransformHooks(
      resolveHook(hooks.alterFirstCallMessage, hooks.alterCallMessage, isFirst),
      message,
    );
    // 2. Before call
    await runSideEffectHooks(
      resolveHook(hooks.beforeFirstCall, hooks.beforeCall, isFirst),
      alteredMessage,
    );
    return alteredMessage;
  }

  /**
   * Run the post-call hook lifecycle (steps 4-5) and return the final
   * result with the altered text. Shared by both `call()` (execute
   * override path) and `stream()` (LLM path).
   */
  async function runPostCallHooks(
    result: AgentCallResult,
    isFirst: boolean,
  ): Promise<AgentCallResult> {
    // 4. After call result (full result with usage)
    await runSideEffectHooks(
      resolveHook(hooks.afterFirstCallResult, hooks.afterCallResult, isFirst),
      result,
    );
    // 5. Alter response
    const alteredText = await runTransformHooks(
      resolveHook(hooks.alterFirstResponse, hooks.alterResponse, isFirst),
      result.text,
    );
    return { ...result, text: alteredText };
  }

  // The agent object

  const agent: Agent = {
    name: config.name,
    config,

    call(message: string): AbortablePromise<AgentCallResult> {
      return createAbortablePromise(
        async (signal): Promise<AgentCallResult> => {
          const streamGenerator = agent.stream!(message);
          signal.addEventListener("abort", () => streamGenerator.abort(), {
            once: true,
          });

          let finalResult: AgentCallResult | undefined;
          for await (const event of streamGenerator) {
            if (event.type === "done") {
              finalResult = event.result;
            }
          }
          return finalResult!;
        },
      );
    },

    // TODO: Right now the stream is the main function for execution, however,
    // I think we need to create a internal helper, that basically will
    // be called execute(callOrStream: boolean) that will either call generate
    // or stream it to the user... But for now stream will just be the centric
    // way we execute LLM requests.
    stream(message: string): AbortableAsyncGenerator<AgentStreamEvent> {
      return createAbortableGenerator(async function* (signal): AsyncGenerator<
        AgentStreamEvent,
        void,
        undefined
      > {
        const isFirst = consumeFirstCall();
        const streamEventHooks = hooks.onStreamEvent;

        try {
          // 1-2. Pre-call hooks
          const alteredMessage = await runPreCallHooks(message, isFirst);

          // 3. Execute — either custom override or LLM stream
          let result: AgentCallResult;

          if (config.execute) {
            // Execute override: run directly, no intermediate stream events.
            const rawExecuteResult = await config.execute(alteredMessage);
            result =
              typeof rawExecuteResult === "string"
                ? {
                    text: rawExecuteResult,
                    responseMessages: [
                      { role: "assistant", content: rawExecuteResult },
                    ],
                    steps: [],
                    usage: { promptTokens: 0, completionTokens: 0 },
                    finishReason: "stop",
                  }
                : rawExecuteResult;
          } else {
            // LLM path: stream via streamText, yield events as they arrive.
            const options = await buildCallOptions(
              config,
              alteredMessage,
              context,
              getToolHooks(),
              signal,
            );
            const streamResult = streamText(options);

            for await (const part of streamResult.fullStream) {
              const event = mapStreamPart(part);
              if (event) {
                if (streamEventHooks && streamEventHooks.length > 0) {
                  await runSideEffectHooks(streamEventHooks, event);
                }
                yield event;
              }
            }

            result = buildStreamCallResult(
              await streamResult.text,
              (await streamResult.response).messages,
              await streamResult.steps,
              await streamResult.totalUsage,
              await streamResult.finishReason,
            );
          }

          // Append to conversation context
          context.append(alteredMessage, result.responseMessages);

          // 4-5. Post-call hooks
          const finalResult = await runPostCallHooks(result, isFirst);

          // Yield done event
          const doneEvent: AgentStreamEvent = {
            type: "done",
            result: finalResult,
          };

          if (streamEventHooks && streamEventHooks.length > 0) {
            await runSideEffectHooks(streamEventHooks, doneEvent);
          }

          yield doneEvent;
        } catch (error) {
          throw new AgentCallError(
            config.name,
            `LLM call failed: ${error instanceof Error ? error.message : String(error)}`,
            { cause: error },
          );
        }
      });
    },

    getConversationContext() {
      return context;
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
      context.clear();
    },

    updatePromptVariables(variables: TemplateVariables): void {
      const prompt = config.systemPrompt;
      if (prompt && typeof prompt !== "string") {
        prompt.updatePromptVariables(variables);
      }
    },
  };

  return agent;
}
