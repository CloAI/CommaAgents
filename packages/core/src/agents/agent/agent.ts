import { streamText } from "ai";
import type {
  AbortableAsyncGenerator,
  AbortablePromise,
} from "../../abortable";
import {
  createAbortableGenerator,
  createAbortablePromise,
} from "../../abortable";
import {
  type ConversationContextOptions,
  createConversationContext,
  createConversationRecord,
} from "../../conversation-context";
import { AgentCallError } from "../../errors/index";
import { runSideEffectHooks } from "../../hooks";
import type { TemplateVariables } from "../../prompts/prompts.types";
import type {
  Agent,
  AgentCallResult,
  AgentConfig,
  AgentRuntime,
  AgentStreamEvent,
} from "./agent.types";
import {
  type AgentHookStore,
  buildCallOptions,
  buildStreamCallResult,
  createModelSummarizer,
  getToolHooks,
  mapStreamPart,
  runPostCallHooks,
  runPreCallHooks,
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
 *
 * @param {AgentConfig} config - Authored model, prompt, tool, and conversation behavior.
 * @param {AgentRuntime} runtime - Optional services supplied by the current execution environment.
 * @returns {Agent} Agent methods and conversation context.
 */
export function createAgent(
  config: AgentConfig,
  runtime: AgentRuntime = {},
): Agent {
  const conversationContext = createConversationContext(
    resolveContextOptions(config),
  );
  let firstCall = true;

  // Mutable hooks store — starts empty, populated via appendHook (hookIntoAgent).
  // All hook reads go through this store so that dynamically appended hooks
  // take effect on subsequent calls.
  // Fields start as undefined (preserving resolveHook fallback semantics)
  // and become arrays when hooks are appended via hookIntoAgent.
  const hooks: AgentHookStore = {
    onCallStarted: undefined,
    onCallCompleted: undefined,
    onCallFailed: undefined,
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

  // The agent object

  const agent: Agent = {
    name: config.name,
    config,

    call(message: string): AbortablePromise<AgentCallResult> {
      return createAbortablePromise(
        async (signal): Promise<AgentCallResult> => {
          const streamGenerator = agent.stream?.(message);
          signal.addEventListener("abort", () => streamGenerator?.abort(), {
            once: true,
          });

          let finalResult: AgentCallResult | undefined;
          for await (const event of streamGenerator ?? []) {
            if (event.type === "done") {
              finalResult = event.result;
            }
          }
          return finalResult!;
        },
      );
    },

    stream(message: string): AbortableAsyncGenerator<AgentStreamEvent> {
      return createAbortableGenerator(async function* (signal): AsyncGenerator<
        AgentStreamEvent,
        void,
        undefined
      > {
        const identity = {
          messageId: crypto.randomUUID(),
          createdAt: new Date().toISOString(),
        };
        const isFirst = consumeFirstCall();
        const streamEventHooks = hooks.onStreamEvent;

        try {
          await runSideEffectHooks(hooks.onCallStarted, identity);
          // 1-2. Pre-call hooks
          const alteredMessage = await runPreCallHooks(hooks, message, isFirst);

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
            const { callOptions, retentionEvents } = await buildCallOptions(
              config,
              { ...runtime, messageId: identity.messageId },
              alteredMessage,
              conversationContext,
              getToolHooks(hooks),
              signal,
            );
            for (const retentionEvent of retentionEvents) {
              const event: AgentStreamEvent = {
                ...identity,
                type: "retention",
                event: retentionEvent,
              };
              if (streamEventHooks && streamEventHooks.length > 0) {
                await runSideEffectHooks(streamEventHooks, event);
              }
              yield event;
            }
            const streamResult = streamText(
              callOptions as Parameters<typeof streamText>[0],
            );

            for await (const part of streamResult.fullStream) {
              const mappedEvent = mapStreamPart(part);
              const event = mappedEvent
                ? { ...mappedEvent, ...identity }
                : undefined;
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

          result = { ...result, ...identity };
          const conversationRecord = createConversationRecord({
            id: identity.messageId,
            createdAt: identity.createdAt,
            agentName: config.name,
            userMessage: alteredMessage,
            responseMessages: result.responseMessages,
            text: result.text,
            usage: result.usage,
            ...(result.contextUsage !== undefined
              ? { contextUsage: result.contextUsage }
              : {}),
            finishReason: result.finishReason,
          });
          conversationContext.appendRecord(conversationRecord);
          await runSideEffectHooks(hooks.onCallCompleted, result);

          // 4-5. Post-call hooks
          const finalResult = await runPostCallHooks(hooks, result, isFirst);

          // Yield done event
          const doneEvent: AgentStreamEvent = {
            ...identity,
            type: "done",
            result: finalResult,
          };

          if (streamEventHooks && streamEventHooks.length > 0) {
            await runSideEffectHooks(streamEventHooks, doneEvent);
          }

          yield doneEvent;
        } catch (error) {
          await runSideEffectHooks(hooks.onCallFailed, {
            ...identity,
            error,
            cancelled: signal.aborted,
          });
          throw new AgentCallError(
            config.name,
            `LLM call failed: ${error instanceof Error ? error.message : String(error)}`,
            { cause: error },
          );
        }
      });
    },

    getConversationContext() {
      return conversationContext;
    },

    /**
     * Append a hook callback to this agent's lifecycle.
     * @param {string} hookName - Supported lifecycle hook.
     * @param {unknown} callback - Callback for that hook's contract.
     * @returns {void} Nothing; updates the hook collection.
     */
    appendHook(hookName: string, callback: unknown): void {
      if (!(hookName in hooks)) {
        throw new Error(`Unknown hook name: "${hookName}"`);
      }
      const hookStoreKey = hookName as keyof typeof hooks;
      const existingHooks = hooks[hookStoreKey];
      if (existingHooks) {
        (existingHooks as unknown[]).push(callback);
      } else {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any -- callback type is checked at runtime/usage
        (hooks as Record<string, unknown>)[hookStoreKey] = [callback];
      }
    },

    reset(): void {
      firstCall = true;
      conversationContext.clear();
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

function resolveContextOptions(
  config: AgentConfig,
): ConversationContextOptions {
  const options = config.context ?? {};
  if (!config.model || options.compaction === false) {
    return options;
  }

  const compaction =
    options.compaction === undefined || options.compaction === true
      ? {}
      : { ...options.compaction };
  if (compaction.summarize !== undefined) {
    return options;
  }

  return {
    ...options,
    compaction: {
      ...compaction,
      summarize: createModelSummarizer(config.model),
    },
  };
}
