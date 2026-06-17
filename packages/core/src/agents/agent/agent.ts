import type {
  AbortableAsyncGenerator,
  AbortablePromise,
} from "@comma-agents/utils";
import {
  createAbortableGenerator,
  createAbortablePromise,
} from "@comma-agents/utils";
import { streamText } from "ai";
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
 */
export function createAgent(config: AgentConfig): Agent {
  const context = createConversationContext(resolveContextOptions(config));
  let firstCall = true;

  // Mutable hooks store — starts empty, populated via appendHook (hookIntoAgent).
  // All hook reads go through this store so that dynamically appended hooks
  // take effect on subsequent calls.
  // Fields start as undefined (preserving resolveHook fallback semantics)
  // and become arrays when hooks are appended via hookIntoAgent.
  const hooks: AgentHookStore = {
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
        const isFirst = consumeFirstCall();
        const streamEventHooks = hooks.onStreamEvent;

        try {
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
            const options = await buildCallOptions(
              config,
              alteredMessage,
              context,
              getToolHooks(hooks),
              signal,
            );
            const streamResult = streamText(
              options as Parameters<typeof streamText>[0],
            );

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

          const conversationRecord = createConversationRecord({
            agentName: config.name,
            userMessage: alteredMessage,
            responseMessages: result.responseMessages,
            text: result.text,
            usage: result.usage,
            ...(result.contextTokens !== undefined
              ? { contextTokens: result.contextTokens }
              : {}),
            finishReason: result.finishReason,
          });
          context.appendRecord(conversationRecord);

          // 4-5. Post-call hooks
          const finalResult = await runPostCallHooks(hooks, result, isFirst);

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
        // eslint-disable-next-line @typescript-eslint/no-explicit-any -- callback type is checked at runtime/usage
        (hooks as Record<string, unknown>)[hookStoreKey] = [callback];
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

function resolveContextOptions(
  config: AgentConfig,
): ConversationContextOptions {
  const options = config.context ?? {};
  if (!options.compaction || !config.model) return options;

  const compaction =
    options.compaction === true ? {} : { ...options.compaction };
  if (compaction.summarize !== undefined) return options;

  return {
    ...options,
    compaction: {
      ...compaction,
      summarize: createModelSummarizer(config.model),
    },
  };
}
