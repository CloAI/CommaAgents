import { streamText } from "ai";
import { createPrivacyRuntime } from "../../model/privacy/privacy";
import { getModelPrivacyRequirements } from "../../model/model.utils";
import { PrivacyRequirementsSchema } from "../../model/privacy/privacy.schemas";
import {
  privacyError,
  sanitizePrivacyError,
} from "../../model/privacy/privacy.utils";
import type { PrivacyReport } from "../../model/privacy";
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
import { parseMcpToolName } from "../../mcp";
import { runSideEffectHooks } from "../../hooks";
import type { TemplateVariables } from "../../prompts/prompts.types";
import type {
  ActiveAgentGeneration,
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
  interruptedCallResult,
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
  const privacy = PrivacyRequirementsSchema.safeParse(
    config.privacy === undefined ? {} : config.privacy,
  );
  if (!privacy.success) {
    throw privacyError("PRIVACY_CONFIGURATION_ERROR");
  }
  const automaticPrivacy = config.model
    ? getModelPrivacyRequirements(config.model)
    : undefined;
  if (automaticPrivacy?.tee) {
    config = { ...config, privacy: { ...privacy.data, ...automaticPrivacy } };
    runtime = {
      ...runtime,
      privacyRuntime: runtime.privacyRuntime ?? createPrivacyRuntime(),
    };
  }
  const protectedRequest = Boolean(config.privacy?.tee || config.privacy?.e2ee);
  if (protectedRequest) {
    if (config.execute) {
      throw privacyError("PRIVACY_CONFIGURATION_ERROR");
    }
    if (
      config.context?.compaction &&
      typeof config.context.compaction === "object" &&
      config.context.compaction.summarize
    ) {
      throw privacyError("PRIVACY_CONFIGURATION_ERROR");
    }
  }
  const conversationContext = createConversationContext(
    resolveContextOptions(config, runtime),
  );
  let firstCall = true;
  const activeGenerations = new Map<string, ActiveAgentGeneration>();

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
    if (wasFirstCall) {
      firstCall = false;
    }
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

    steer(messageId, text, beforeResume): boolean {
      const active = activeGenerations.get(messageId);
      if (!active?.accepting || !text.trim()) {
        return false;
      }
      const persisted = beforeResume?.() ?? Promise.resolve();
      // Observe write failures immediately; the segment awaits and propagates them.
      void persisted.catch(() => {});
      active.steering.push({ text, persisted });
      active.controller.abort(
        new DOMException("Interrupted by user steering", "AbortError"),
      );
      return true;
    },

    stream(message: string): AbortableAsyncGenerator<AgentStreamEvent> {
      return createAbortableGenerator(async function* (signal): AsyncGenerator<
        AgentStreamEvent,
        void,
        undefined
      > {
        let nextMessage = message;
        while (true) {
          signal.throwIfAborted();
          const identity = {
            messageId: crypto.randomUUID(),
            createdAt: new Date().toISOString(),
          };
          const isFirst = consumeFirstCall();
          const privacyReports: PrivacyReport[] = [];
          const streamEventHooks = hooks.onStreamEvent;
          const generation: ActiveAgentGeneration = {
            controller: new AbortController(),
            steering: [],
            accepting: !config.execute,
          };
          const stopGeneration = () =>
            generation.controller.abort(signal.reason);
          signal.addEventListener("abort", stopGeneration, { once: true });
          if (signal.aborted) {
            stopGeneration();
          }
          if (!config.execute) {
            activeGenerations.set(identity.messageId, generation);
          }
          const segmentEvents: AgentStreamEvent[] = [];
          const pendingTools: Promise<unknown>[] = [];
          const settledToolEvents: AgentStreamEvent[] = [];
          const executedToolCalls: AgentStreamEvent[] = [];
          let alteredMessage = nextMessage;

          try {
            await runSideEffectHooks(hooks.onCallStarted, identity);
            // 1-2. Pre-call hooks
            alteredMessage = await runPreCallHooks(hooks, nextMessage, isFirst);

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
              // LLM path: steering cancels this segment, not the enclosing call.
              try {
                const { callOptions, retentionEvents } = await buildCallOptions(
                  config,
                  { ...runtime, messageId: identity.messageId },
                  alteredMessage,
                  conversationContext,
                  getToolHooks(hooks),
                  generation.controller.signal,
                  (report) => privacyReports.push(report),
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
                const generationTools = callOptions.tools ?? {};
                for (const [toolName, toolDefinition] of Object.entries(
                  generationTools,
                )) {
                  const executeTool = toolDefinition.execute;
                  if (!executeTool) {
                    continue;
                  }
                  const toolOrigin = parseMcpToolName(toolName);
                  const wrappedTool = { ...toolDefinition };
                  generationTools[toolName] = wrappedTool;
                  wrappedTool.execute = (toolInput, toolOptions) => {
                    executedToolCalls.push({
                      ...identity,
                      ...(toolOrigin ? { mcp: toolOrigin } : {}),
                      type: "tool-call",
                      toolCallId: toolOptions.toolCallId,
                      toolName,
                      args: JSON.stringify(toolInput),
                    });
                    const settlement = Promise.withResolvers<unknown>();
                    pendingTools.push(settlement.promise);
                    void settlement.promise.catch(() => {});
                    const completeTool = (output: unknown) => {
                      settledToolEvents.push({
                        ...identity,
                        ...(toolOrigin ? { mcp: toolOrigin } : {}),
                        type: "tool-result",
                        toolCallId: toolOptions.toolCallId,
                        toolName,
                        output:
                          typeof output === "string"
                            ? output
                            : (JSON.stringify(output) ?? ""),
                        status: "completed",
                        ...(generation.steering.length
                          ? {
                              cancellationRequestedBy: "user_steering" as const,
                            }
                          : {}),
                      });
                      settlement.resolve(output);
                      return output;
                    };
                    const failTool = (error: unknown) => {
                      settledToolEvents.push({
                        ...identity,
                        ...(toolOrigin ? { mcp: toolOrigin } : {}),
                        type: "tool-result",
                        toolCallId: toolOptions.toolCallId,
                        toolName,
                        output: "",
                        status: "error",
                        error:
                          error instanceof Error
                            ? error.message
                            : String(error),
                        ...(generation.steering.length &&
                        generation.controller.signal.aborted
                          ? {
                              cancellationReason: "user_steering" as const,
                              cancellationRequestedBy: "user_steering" as const,
                            }
                          : {}),
                      });
                      settlement.reject(error);
                      throw error;
                    };
                    try {
                      const outputSource = executeTool.call(
                        toolDefinition,
                        toolInput,
                        toolOptions,
                      );
                      if (
                        outputSource != null &&
                        typeof outputSource === "object" &&
                        Symbol.asyncIterator in outputSource
                      ) {
                        return (async function* () {
                          let finalOutput: unknown;
                          try {
                            for await (const output of outputSource) {
                              finalOutput = output;
                              yield output;
                            }
                            completeTool(finalOutput);
                          } catch (error) {
                            failTool(error);
                          } finally {
                            // An SDK consumer can return early after aborting the model stream.
                            // Its generator has settled even if it never reached its final yield.
                            settlement.resolve(finalOutput);
                          }
                        })();
                      }
                      return Promise.resolve(outputSource).then(
                        completeTool,
                        failTool,
                      );
                    } catch (error) {
                      failTool(error);
                      throw error;
                    }
                  };
                }
                const streamResult = streamText(
                  callOptions as Parameters<typeof streamText>[0],
                );

                for await (const part of streamResult.fullStream) {
                  if (part.type === "error") {
                    throw protectedRequest ||
                      (part.error instanceof Error &&
                        part.error.name === "PrivacyError")
                      ? sanitizePrivacyError(part.error, signal)
                      : part.error;
                  }
                  const mappedEvent = mapStreamPart(part);
                  const event = mappedEvent
                    ? { ...mappedEvent, ...identity }
                    : undefined;
                  if (event) {
                    segmentEvents.push(event);
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
              } catch (error) {
                if (!generation.steering.length || signal.aborted) {
                  throw error;
                }
                result = interruptedCallResult(segmentEvents);
              }
              if (generation.steering.length) {
                await Promise.allSettled(pendingTools);
                const streamedCalls = new Set(
                  segmentEvents.flatMap((event) =>
                    event.type === "tool-call" ? [event.toolCallId] : [],
                  ),
                );
                for (const event of executedToolCalls) {
                  if (
                    event.type !== "tool-call" ||
                    streamedCalls.has(event.toolCallId)
                  ) {
                    continue;
                  }
                  segmentEvents.push(event);
                  await runSideEffectHooks(streamEventHooks, event);
                  yield event;
                }
                // The SDK can stop delivering tool results when its stream aborts.
                // Preserve outcomes from tools that settled after cancellation.
                for (const event of settledToolEvents) {
                  segmentEvents.push(event);
                  await runSideEffectHooks(streamEventHooks, event);
                  yield event;
                }
                result = interruptedCallResult(segmentEvents);
              }
            }
            generation.accepting = false;
            signal.throwIfAborted();

            result = {
              ...result,
              ...identity,
              ...(privacyReports.length
                ? { privacyReports: [...privacyReports] }
                : {}),
            };
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

            if (generation.steering.length) {
              await Promise.all(
                generation.steering.map((entry) => entry.persisted),
              );
              signal.throwIfAborted();
              nextMessage = generation.steering
                .map((entry) => entry.text)
                .join("\n\n");
              continue;
            }

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
            return;
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
          } finally {
            generation.accepting = false;
            activeGenerations.delete(identity.messageId);
            signal.removeEventListener("abort", stopGeneration);
          }
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
  runtime: AgentRuntime,
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
      summarize: createModelSummarizer(
        compaction.model ?? config.model,
        {
          privacy: config.privacy,
          privacyRuntime: runtime.privacyRuntime,
        },
        compaction.extraSections,
      ),
    },
  };
}
