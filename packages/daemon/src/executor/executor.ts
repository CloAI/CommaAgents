import type {
  AgentCallResult,
  AgentHooks,
  AgentStreamEvent,
  ConversationTurn,
  FlowHooks,
  LaunchStrategyHandle,
  LaunchStrategyResult,
  PermissionDecision,
  PolicyPatch,
  ResponseMessage,
  Sandbox,
  UserModelMessage,
} from "@comma-agents/core";
import {
  getSandbox,
  hookIntoAgent,
  inSandbox,
  loadProject,
  loadSkills,
  loadStrategyFromString,
  pathPolicy,
  readStrategyFile,
} from "@comma-agents/core";
import type { Logger } from "../logger";
import type { RunStore } from "../runs";
import type { ConversationTurn } from "@comma-agents/core";
import type { AgentStreamEventWire } from "../server/protocol";
import type { DaemonState, RunState } from "../state/state.types";
import type { EventSink } from "./event-sink";
import type { InputBridge } from "./input-bridge";
import { createInputBridge } from "./input-bridge";
import type { PermissionBridge } from "./permission-bridge";
import { createPermissionBridge } from "./permission-bridge";
import type { QuestionBridge } from "./question-bridge";
import { createQuestionBridge } from "./question-bridge";

/**
 * Options for creating a strategy executor.
 *
 * Model and credential resolution happen via global registries. The daemon
 * must configure setGlobalCredentialStore() and registerProvider() before
 * creating the executor.
 */
export interface CreateStrategyExecutorOptions {
  /** Centralized daemon state for run/client/subscription tracking. */
  readonly state: DaemonState;
  /** EventSink for delivering messages to clients. */
  readonly sink: EventSink;
  /** Logger for executor-level diagnostics. */
  readonly logger: Logger;
  /** Persistent run store. Auto-saves turns and run summaries. */
  readonly runStore: RunStore;
  /** Timeout in ms for input bridge. 0 = no timeout. Default: 0. */
  readonly bridgeTimeout?: number;
  /**
   * Override the model for ALL agents in every strategy executed by this daemon.
   * Format: "providerID/modelID" (e.g., "github-copilot/gpt-4o").
   *
   * When set, ignores the model strings in strategy files and uses this
   * model for every LLM agent. The provider ID from the override is also
   * used for credential resolution via the global credential store.
   */
  readonly modelOverride?: string;
}

/** Per-run context held by the executor. */
interface RunContext {
  readonly inputBridge: InputBridge;
  readonly permissionBridge: PermissionBridge;
  readonly questionBridge: QuestionBridge;
  readonly clientId: string;
  /** Set after sandbox is created in executeRun (after strategy file parse). */
  sandbox?: Sandbox;
  /** Set after the strategy is loaded; used when persisting turns. */
  strategyName?: string;
  /**
   * Last agent output text from any agent in this run, used to detect
   * agent-to-agent handoffs in `beforeCall`. When the message passed to
   * `beforeCall` matches this text, the `userMessageSource` is tagged
   * `"agent"` instead of `"human"`.
   */
  lastAgentOutputText: string | null;
}

/** The strategy executor instance. */
export interface StrategyExecutor {
  /**
   * Start executing a strategy. Returns the run ID immediately.
   * Execution proceeds in the background (fire-and-forget).
   *
   * @param clientId - The client that requested execution.
   * @param strategyPath - Filesystem path to the strategy file.
   * @param input - Optional initial input for the strategy's entry flow.
   * @param requestId - Optional requestId for protocol correlation.
   * @param modelOverride - Optional per-run model override (takes precedence over executor-level override).
   * @param cwd - Optional working directory for the strategy's sandbox. Defaults to process.cwd().
   * @param manifestPath - Optional path to a comma-project.json manifest for project-based strategies.
   * @returns The newly created run ID.
   */
  startRun(
    clientId: string,
    strategyPath: string,
    input?: string,
    requestId?: string,
    modelOverride?: string,
    cwd?: string,
    manifestPath?: string,
  ): string;

  /**
   * Resume a previously stopped/cancelled/interrupted run.
   * Execution proceeds in the background (fire-and-forget).
   *
   * @param clientId - The client that requested execution.
   * @param runId - The run ID to resume.
   * @param requestId - Optional requestId for protocol correlation.
   * @param modelOverride - Optional per-run model override.
   */
  resumeRun(
    clientId: string,
    runId: string,
    requestId?: string,
    modelOverride?: string,
  ): void;

  /**
   * Cancel a running strategy by run ID.
   * Aborts the execution, destroys bridges, and broadcasts `strategy_error`.
   */
  stopRun(runId: string): void;

  /**
   * Route a `user_input` message to the correct run's input bridge.
   *
   * @returns `true` if the input was delivered to a pending request.
   */
  handleUserInput(runId: string, agentName: string, text: string): boolean;

  /**
   * Route a `permission_decision` message to the correct run's permission bridge.
   *
   * @returns `true` if a pending permission request was found and resolved.
   */
  handlePermissionDecision(
    runId: string,
    permissionRequestId: string,
    decision: import("@comma-agents/core").PermissionDecision,
  ): boolean;

  /**
   * Route a `question_response` message to the correct run's question bridge.
   *
   * @returns `true` if a pending question request was found and resolved.
   */
  handleQuestionResponse(
    runId: string,
    questionRequestId: string,
    response: string,
  ): boolean;

  /**
   * Apply a policy patch from an `update_policy` client message to the run's sandbox.
   * @param toolName - Optional tool name to target. If omitted, applies to all guards.
   * @param toolName - Optional tool name to target. If omitted, applies to all guards.
   *
   * @returns `true` if the run was found and the policy was updated.
   */
  handleUpdatePolicy(
    runId: string,
    patch: import("@comma-agents/core").PolicyPatch,
    toolName?: string,
  ): boolean;
}

/**
 * Read a strategy file and return the content + format.
 *
 * Zod validation happens downstream in `loadStrategyFromString`.
 */
async function parseStrategyFile(filePath: string): Promise<{
  content: string;
  format: "json" | "yaml";
}> {
  return await readStrategyFile(filePath);
}

function toWireResult(result: AgentCallResult): {
  text: string;
  usage: { promptTokens: number; completionTokens: number };
  finishReason: string;
} {
  return {
    text: result.text,
    usage: {
      promptTokens: result.usage.promptTokens,
      completionTokens: result.usage.completionTokens,
    },
    finishReason: result.finishReason,
  };
}

/** Serialize AgentStreamEvent for wire (strip the `steps` from `done` result). */
function toWireStreamEvent(event: AgentStreamEvent): AgentStreamEventWire {
  if (event.type === "done") {
    return { type: "done", result: toWireResult(event.result) } as AgentStreamEventWire;
  }
  // Other event types are already wire-compatible
  return { ...event } as unknown as AgentStreamEventWire;
}

/**
 * Create a strategy executor.
 *
 * The executor is the orchestration layer that connects incoming
 * `start_strategy` requests to core's `loadStrategy()` and manages the
 * full lifecycle: credential resolution, hook injection, event forwarding,
 * input/auth bridging, and state updates.
 */
export function createStrategyExecutor(
  options: CreateStrategyExecutorOptions,
): StrategyExecutor {
  const {
    state,
    sink,
    logger,
    runStore,
    bridgeTimeout = 0,
    modelOverride,
  } = options;

  /** runId → per-run context (bridge, client). */
  const runContexts = new Map<string, RunContext>();

  /** Append run_completed event to the run store. Logs but never throws. */
  async function appendCompletedEvent(
    runId: string,
    status: "completed" | "error" | "cancelled",
    errorInfo?: { code: string; message: string },
  ): Promise<void> {
    try {
      await runStore.appendEvent(runId, {
        type: "run_completed",
        ts: new Date().toISOString(),
        status,
        error: errorInfo,
      });
    } catch (saveError) {
      logger.warn(
        `run ${runId}: failed to append run_completed event: ${saveError instanceof Error ? saveError.message : String(saveError)}`,
      );
    }
  }

  //AI: Make this function name more descriptive
  function buildFlowHooks(runId: string): FlowHooks {
    return {
      beforeStep: [
        (ctx: { readonly stepName: string; readonly message: string }) => {
          const ts = new Date().toISOString();
          void runStore.appendEvent(runId, {
            type: "step_started",
            ts,
            stepName: ctx.stepName,
          }).catch((err) => logger.warn(`Failed to append step_started: ${err}`));

          sink.broadcast(runId, {
            type: "step_started" as const,
            runId,
            stepName: ctx.stepName,
            message: ctx.message,
            ts,
          });
        },
      ],
      afterStep: [
        (ctx: {
          readonly stepName: string;
          readonly message: string;
          readonly result: AgentCallResult;
        }) => {
          const ts = new Date().toISOString();
          void runStore.appendEvent(runId, {
            type: "step_completed",
            ts,
            stepName: ctx.stepName,
          }).catch((err) => logger.warn(`Failed to append step_completed: ${err}`));

          sink.broadcast(runId, {
            type: "step_completed" as const,
            runId,
            stepName: ctx.stepName,
            result: toWireResult(ctx.result),
            ts,
          });
        },
      ],
    };
  }

  /** Cap on tool args/output preview length in daemon log lines. */
  const TOOL_LOG_PREVIEW_LIMIT = 200;

  /**
   * Truncate a multi-line string to a single-line preview suitable for log
   * output. Newlines are replaced with `\n` literals so the entry stays on
   * one log line, and anything beyond the cap is replaced with an ellipsis.
   */
  function previewForLog(value: string): string {
    const flattened = value.replace(/\r?\n/g, "\\n");
    if (flattened.length <= TOOL_LOG_PREVIEW_LIMIT) return flattened;
    return `${flattened.slice(0, TOOL_LOG_PREVIEW_LIMIT)}\u2026`;
  }

  /**
   * Emit a structured `info`-level log entry for tool-call and tool-result
   * stream events. All other event kinds (text, thinking, step lifecycle)
   * are intentionally skipped — they're already broadcast to clients and
   * logging them on the daemon side would flood the log.
   */
  function logToolEvent(
    runId: string,
    agentName: string,
    event: AgentStreamEvent,
  ): void {
    const runTag = `[run ${runId.slice(0, 8)}]`;
    if (event.type === "tool-call") {
      logger.info(
        `${runTag} agent=${agentName} tool-call: ${event.toolName} args=${previewForLog(event.args)}`,
      );
      return;
    }
    if (event.type === "tool-result") {
      const output = event.output;
      logger.info(
        `${runTag} agent=${agentName} tool-result: ${event.toolName} output=${output.length} chars: ${previewForLog(output)}`,
      );
    }
  }

  //AI: Make this function name more descriptive
  function buildAgentHooks(
    runId: string,
    agentName: string,
    run: RunState,
    isUserAgent?: boolean,
  ): AgentHooks {
    let pendingUserMessage: string | null = null;
    let pendingUserMessageSource: "human" | "agent" = "human";

    return {
      beforeCall: [
        (message: string) => {
          pendingUserMessage = message;
          const ctx = runContexts.get(run.id);
          if (
            ctx &&
            ctx.lastAgentOutputText !== null &&
            message === ctx.lastAgentOutputText
          ) {
            pendingUserMessageSource = "agent";
          } else {
            pendingUserMessageSource = "human";
          }
        },
      ],
      onStreamEvent: [
        (event: AgentStreamEvent) => {
          logToolEvent(runId, agentName, event);
          if (isUserAgent) return;
          sink.broadcast(runId, {
            type: "agent_streaming" as const,
            runId,
            agentName,
            event: toWireStreamEvent(event),
            ts: new Date().toISOString(),
          });
        },
      ],
      afterCallResult: [
        (result: AgentCallResult) => {
          const completedAt = new Date().toISOString();
          if (!isUserAgent) {
            sink.broadcast(runId, {
              type: "agent_output" as const,
              runId,
              agentName,
              text: result.text,
              usage: {
                promptTokens: result.usage.promptTokens,
                completionTokens: result.usage.completionTokens,
              },
              ts: completedAt,
            });
          }

          const ctx = runContexts.get(run.id);
          const userMessage = pendingUserMessage ?? "";
          pendingUserMessage = null;

          if (ctx) {
            ctx.lastAgentOutputText = result.text;
          }

          const userMsg: UserModelMessage = {
            role: "user",
            content: userMessage,
          };

          const event: import("@comma-agents/core").TimelineEvent = {
            type: "agent_call",
            ts: completedAt,
            agentName,
            userMessage: userMsg,
            responseMessages: result.responseMessages as ResponseMessage[],
          };

          runStore
            .appendEvent(run.id, event)
            .catch((appendError) => {
              logger.warn(
                `run ${run.id}: failed to append agent_call event: ${appendError instanceof Error ? appendError.message : String(appendError)}`,
              );
            });
        },
      ],
    };
  }

  async function executeRun(
    run: RunState,
    strategyPath: string,
    input: string,
    requestId: string | undefined,
    runModelOverride: string | undefined,
    runCwd: string | undefined,
    manifestPath: string | undefined,
    initialAgentTurns?: Map<string, readonly ConversationTurn[]>,
  ): Promise<void> {
    const ctx = runContexts.get(run.id);
    if (!ctx) return;

    const originalInputBridge = ctx.inputBridge;

    try {
      // 0. If a project manifest is provided, load the project first.
      //    This runs the entry file and registers custom tools.
      let effectiveStrategyPath = strategyPath;
      if (manifestPath) {
        logger.debug(
          `run ${run.id}: loading project manifest from ${manifestPath}`,
        );
        const project = await loadProject(manifestPath);
        logger.debug(
          `run ${run.id}: project "${project.name}" loaded, manifestDir="${project.manifestDir}"`,
        );
        effectiveStrategyPath = strategyPath;
      }

      // 1. Parse the strategy file
      const { content, format } = await parseStrategyFile(effectiveStrategyPath);
      logger.debug(
        `run ${run.id}: parsed (${format}, ${content.length} bytes); loading strategy`,
      );

      // 2. Build a seed-aware collector. The TUI sends the first user prompt
      //    via `start_strategy.input`. If the strategy's first step is a
      //    `user` agent (very common — Plan, Build, etc.), that step would
      //    otherwise discard the seed and call `request_input`, forcing the
      //    user to type their prompt a second time. By wrapping the bridge
      //    collector and returning the seed on the FIRST call, the strategy
      //    receives the user's intended input immediately and proceeds to
      //    the next step without an extra round-trip. Subsequent calls
      //    (later user steps, e.g. follow-up Q&A) delegate to the bridge.

      // AI: this should be at the startRun function layer, not sure why we have it on execute...
      let seed: string | null = input.length > 0 ? input : null;
      const wrappedCollector =
        seed !== null
          ? (request: {
              agentName: string;
              prompt: string;
            }): Promise<string> => {
              if (seed !== null) {
                const value = seed;
                seed = null;
                logger.debug(
                  `run ${run.id}: pre-seeding first user input for agent "${request.agentName}" (${value.length} bytes)`,
                );
                return Promise.resolve(value);
              }
              return ctx.inputBridge.collector(request);
            }
          : ctx.inputBridge.collector;

      // 3. Discover skills for this workspace (global + project). Missing
      // directories are silently ignored; malformed skills surface as
      // non-fatal warnings, which we log but do not propagate.
      const { registry: skillRegistry, warnings: skillWarnings } =
        await loadSkills(runCwd ?? process.cwd());
      for (const warning of skillWarnings) {
        logger.warn(
          `run ${run.id}: skill warning at ${warning.sourcePath}: ${warning.message}`,
        );
      }
      if (!skillRegistry.isEmpty()) {
        logger.debug(
          `run ${run.id}: loaded ${skillRegistry.list().length} skill(s): [${skillRegistry
            .list()
            .map((s) => s.name)
            .join(",")}]`,
        );
      }

      // 4. Build a `launchStrategy` handle bound to this run. Threaded
      //    through `loadStrategyFromString` into every agent's
      //    ToolContext so the `launch_strategy` tool can spawn nested
      //    strategies that reuse THIS run's flow/agent hook pipeline.
      //    Nested agent activity is broadcast under the parent run id,
      //    so the TUI sees a single timeline.
      //
      //    Sandbox: nested strategies inherit the parent's process-wide
      //    `Sandbox` state via `getSandbox(strategy)`; we do not re-apply
      //    `inSandbox()` for nested loads. Per design, sub-strategies are
      //    subject to the parent's policies.
      //
      //    Self-reference: declared with `let` and assigned below so the
      //    closure can pass itself into nested `loadStrategyFromString`
      //    calls, enabling arbitrarily-nested `launch_strategy` use.
      let launchStrategy!: LaunchStrategyHandle;
      launchStrategy = async ({
        strategyPath,
        manifestPath: subManifestPath,
        input: subInput,
        modelOverride: subModelOverride,
      }): Promise<LaunchStrategyResult> => {
        logger.debug(
          `run ${run.id}: launch_strategy spawning sub-strategy "${strategyPath}"`,
        );
        if (subManifestPath) {
          await loadProject(subManifestPath);
        }
        const { content: subContent, format: subFormat } =
          await readStrategyFile(strategyPath);
        const subStrategy = await loadStrategyFromString(
          subContent,
          subFormat,
          {
            inputCollector: wrappedCollector,
            flowHooks: buildFlowHooks(run.id),
            modelOverride:
              subModelOverride ?? runModelOverride ?? modelOverride,
            skillRegistry,
            launchStrategy,
          },
        );
        for (const [subAgentName, subAgent] of Object.entries(
          subStrategy.agents,
        )) {
          if (subAgent.appendHook) {
            const isUserAgent = subAgent.config?.type === "user";
            hookIntoAgent(
              subAgent,
              buildAgentHooks(run.id, subAgentName, run, isUserAgent),
            );
          }
        }
        const subResult = await subStrategy.flow.call(subInput);
        return {
          strategyName: subStrategy.name,
          text: subResult.text,
          ...(subResult.finishReason
            ? { finishReason: subResult.finishReason }
            : {}),
        };
      };

      // 5. Load the strategy — model and tool resolution happen via global registries
      const strategy = await loadStrategyFromString(content, format, {
        inputCollector: wrappedCollector,
        flowHooks: buildFlowHooks(run.id),
        modelOverride: runModelOverride ?? modelOverride,
        skillRegistry,
        initialAgentTurns,
        launchStrategy,
      });
      logger.debug(
        `run ${run.id}: strategy loaded (name="${strategy.name}", agents=[${Object.keys(strategy.agents).join(",")}])`,
      );

      // 5. Apply sandbox to the loaded strategy.
      //
      // Policy shape:
      //   - `allowAbsolutePaths: true`     — tools may pass absolute paths.
      //   - `read/write.allow: ["**"]`     — all paths inside cwd are auto-allowed
      //                                       (no prompt). cwd is "free game".
      //   - `read/write.default: "ask"`    — anything resolving outside cwd falls
      //                                       through to the default and triggers
      //                                       the TUI permission prompt.
      //   - `forbiddenGlobs` (defaults)    — still enforced for `.git`, `.env*`,
      //                                       keys, secrets, regardless of cwd.
      inSandbox(
        strategy,
        {
          cwd: runCwd,
          jail: false,
          allowAbsolutePaths: true,
          read: { default: "ask", allow: ["**"] },
          write: { default: "ask", allow: ["**"] },
          trashMetadata: {
            runId: run.id,
          },
        },
        {
          onAsk: ctx.permissionBridge.requester,
          onQuestion: ctx.questionBridge.requester,
          onPolicyChange: (snapshot) => {
            sink.broadcast(run.id, {
              type: "policy_updated" as const,
              runId: run.id,
              tool: snapshot.toolName,
              policies: snapshot.policies,
              ts: new Date().toISOString(),
            });
          },
        },
      );

      const sandbox = getSandbox(strategy)!;

      // Store sandbox on context for handleUpdatePolicy
      ctx.sandbox = sandbox;

      // 5. Inject agent hooks into all loaded agents via hookIntoAgent
      for (const [agentName, loadedAgent] of Object.entries(strategy.agents)) {
        if (loadedAgent.appendHook) {
          const isUserAgent = loadedAgent.config?.type === "user";
          hookIntoAgent(loadedAgent, buildAgentHooks(run.id, agentName, run, isUserAgent));
        }
      }

      // Strategy name is now known — capture for run turn metadata.
      ctx.strategyName = strategy.name;

      // 5. Update state to running
      state.updateRun(run.id, { status: "running" });

      // 6. Broadcast strategy_started
      const subscriberCount = state.getSubscribers(run.id).length;
      logger.debug(
        `run ${run.id}: broadcasting strategy_started to ${subscriberCount} subscriber(s)`,
      );
      sink.broadcast(run.id, {
        type: "strategy_started" as const,
        runId: run.id,
        strategyName: strategy.name,
        agents: Object.keys(strategy.agents),
        flowTree: strategy.raw.flow as unknown as Record<string, unknown>,
        ts: new Date().toISOString(),
        requestId,
      });

      // 6. Execute the strategy's entry flow
      logger.debug(
        `run ${run.id}: invoking strategy.flow.call(input.length=${input.length})`,
      );
      const result = await strategy.flow.call(input);
      logger.debug(`run ${run.id}: flow.call resolved`);

      // 7. Success — update state and broadcast completion
      state.updateRun(run.id, {
        status: "completed",
        completedAt: new Date(),
        result,
      });
      await appendCompletedEvent(run.id, "completed");

      sink.broadcast(run.id, {
        type: "strategy_completed" as const,
        runId: run.id,
        result: result.text,
        usage: {
          promptTokens: result.usage.promptTokens,
          completionTokens: result.usage.completionTokens,
        },
        ts: new Date().toISOString(),
        requestId,
      });
    } catch (err) {
      // Determine if this was an abort/cancellation
      const isAbort = err instanceof DOMException && err.name === "AbortError";
      const errorStatus = isAbort ? "cancelled" : "error";
      const errorCode = isAbort ? "CANCELLED" : "EXECUTION_ERROR";
      const errorMessage = err instanceof Error ? err.message : String(err);

      logger.warn(
        `run ${run.id}: caught ${isAbort ? "abort" : "error"}: ${errorMessage}`,
      );

      // Only update if the run still exists (may have been removed)
      const existingRun = state.getRun(run.id);
      if (existingRun && existingRun.status !== "cancelled") {
        state.updateRun(run.id, {
          status: errorStatus,
          completedAt: new Date(),
          error: { code: errorCode, message: errorMessage },
        });
        await appendCompletedEvent(run.id, errorStatus, {
          code: errorCode,
          message: errorMessage,
        });

        const subs = state.getSubscribers(run.id).length;
        logger.debug(
          `run ${run.id}: broadcasting strategy_error to ${subs} subscriber(s)`,
        );
        sink.broadcast(run.id, {
          type: "strategy_error" as const,
          runId: run.id,
          error: { code: errorCode, message: errorMessage },
          ts: new Date().toISOString(),
          requestId,
        });
      } else {
        logger.debug(
          `run ${run.id}: skipping strategy_error broadcast (run ${existingRun ? "already cancelled" : "missing"})`,
        );
      }

      if (!isAbort) {
        logger.error(`Run ${run.id} failed: ${errorMessage}`);
      }
    } finally {
      // Clean up bridges ONLY if they belong to this exact execution instance.
      // If a resume has overtaken this run, a new context will have been registered.
      const runContext = runContexts.get(run.id);
      if (runContext && runContext.inputBridge === originalInputBridge) {
        runContext.inputBridge.destroy();
        runContext.permissionBridge.destroy();
        runContexts.delete(run.id);
      }
    }
  }

  return {
    resumeRun(
      clientId: string,
      runId: string,
      requestId?: string,
      runModelOverride?: string,
    ): void {
      logger.info(`resumeRun: client=${clientId} runId=${runId}`);

      // Replay existing events to recreate run and hydrate agent contexts
      const startResuming = async () => {
        // 1. Load existing events
        const events = await runStore.getEvents(runId);
        const startEvent = events.find((ev) => ev.type === "run_started");
        if (!startEvent || startEvent.type !== "run_started") {
          logger.error(`resumeRun failed: run_started event not found for ${runId}`);
          sink.send(clientId, {
            type: "error" as const,
            code: "NOT_FOUND",
            message: `Cannot resume run: start event not found for ${runId}`,
            ts: new Date().toISOString(),
            ...(requestId ? { requestId } : {}),
          });
          return;
        }

        const { strategyPath, strategyName, cwd, initialInput, manifestPath } = startEvent;

        // 2. Re-create the in-memory RunState under the existing runId
        const run = state.createRun(strategyPath, strategyName, cwd, runId);

        // 3. Re-subscribe the requesting client
        state.subscribe(clientId, run.id);

        // 4. Construct initialAgentTurns map
        const initialAgentTurns = new Map<string, ConversationTurn[]>();
        for (const event of events) {
          if (event.type === "agent_call") {
            const list = initialAgentTurns.get(event.agentName) ?? [];
            list.push({
              agentName: event.agentName,
              userMessage: event.userMessage,
              responseMessages: event.responseMessages as ResponseMessage[],
            });
            initialAgentTurns.set(event.agentName, list);
          }
        }

        // 5. Append run_started again to record resume transition
        await runStore.appendEvent(run.id, {
          type: "run_started",
          ts: run.startedAt.toISOString(),
          strategyPath,
          strategyName,
          cwd,
          initialInput,
          manifestPath,
        });

        // 6. Create bridges
        const inputBridge = createInputBridge({
          sink,
          runId: run.id,
          timeout: bridgeTimeout,
          abort: run.abortController.signal,
        });

        const permissionBridge = createPermissionBridge({
          sink,
          runId: run.id,
          timeout: bridgeTimeout,
          abort: run.abortController.signal,
        });

        const questionBridge = createQuestionBridge({
          sink,
          runId: run.id,
          timeout: bridgeTimeout,
          abort: run.abortController.signal,
        });

        runContexts.set(run.id, {
          inputBridge,
          permissionBridge,
          questionBridge,
          clientId,
          lastAgentOutputText: null,
        });

        // 7. Kick off executeRun
        // We only pre-seed the initial input if the run has no prior turns.
        // If it already has turns, pre-seeding would cause the next live user step
        // to consume the original prompt again, causing redundant LLM execution.
        const resumeInput = initialAgentTurns.size === 0 ? (initialInput ?? "") : "";

        await executeRun(
          run,
          strategyPath,
          resumeInput,
          requestId,
          runModelOverride ?? modelOverride,
          cwd,
          manifestPath,
          initialAgentTurns,
        );
      };

      startResuming().catch((caughtError) => {
        logger.error(
          `Unexpected error in resumeRun for ${runId}: ${caughtError instanceof Error ? caughtError.message : String(caughtError)}`,
        );
      });
    },

    startRun(
      clientId: string,
      strategyPath: string,
      input?: string,
      requestId?: string,
      runModelOverride?: string,
      runCwd?: string,
      manifestPath?: string,
    ): string {
      // 0. Resolve the cwd for this run
      const effectiveCwd = runCwd ?? process.cwd();

      // 1. Create run in state (status: "pending")
      // Use the file path as a temporary name — the real name comes
      // from the strategy file after parsing.
      const run = state.createRun(
        strategyPath,
        strategyPath,
        effectiveCwd,
      );

      // 2. Create the run file by appending the run_started event.
      // Fire-and-forget: runs.ts serializes per-runId writes, so any
      // subsequent appendEvent calls queue behind this.
      void runStore
        .appendEvent(run.id, {
          type: "run_started",
          ts: run.startedAt.toISOString(),
          strategyPath,
          strategyName: strategyPath, // temporary, updated after parsing
          cwd: effectiveCwd,
          initialInput: input,
        })
        .catch((createRunError: unknown) => {
          logger.error(
            `runStore.appendEvent failed for ${run.id}: ${
              createRunError instanceof Error
                ? createRunError.message
                : String(createRunError)
            }`,
          );
        });

      logger.info(
        `startRun: client=${clientId} run=${run.id} path=${strategyPath} cwd=${effectiveCwd}`,
      );

      // 2. Subscribe the requesting client to this run
      state.subscribe(clientId, run.id);

      // 3. Create input bridge for this run
      const inputBridge = createInputBridge({
        sink,
        runId: run.id,
        timeout: bridgeTimeout,
        abort: run.abortController.signal,
      });

      // 4. Create permission bridge for this run
      const permissionBridge = createPermissionBridge({
        sink,
        runId: run.id,
        timeout: bridgeTimeout,
        abort: run.abortController.signal,
      });

      // 4.5. Create question bridge for this run
      const questionBridge = createQuestionBridge({
        sink,
        runId: run.id,
        timeout: bridgeTimeout,
        abort: run.abortController.signal,
      });

      // 5. Store run context
      runContexts.set(run.id, {
        inputBridge,
        permissionBridge,
        questionBridge,
        clientId,
        lastAgentOutputText: null,
      });

      // 5. Kick off execution (fire-and-forget)
      executeRun(
        run,
        strategyPath,
        input ?? "",
        requestId,
        runModelOverride,
        runCwd,
        manifestPath,
      ).catch((caughtError) => {
        // This should never happen — executeRun has its own try/catch.
        // But log just in case.
        logger.error(
          `Unexpected error in executeRun for ${run.id}: ${caughtError}`,
        );
      });

      return run.id;
    },

    stopRun(runId: string): void {
      const run = state.getRun(runId);
      if (!run) {
        logger.warn(`stopRun: run not found: ${runId}`);
        return;
      }

      // Abort the execution
      run.abortController.abort();

      // Update state if not already terminal
      if (run.status === "pending" || run.status === "running") {
        state.updateRun(runId, {
          status: "cancelled",
          completedAt: new Date(),
          error: { code: "CANCELLED", message: "Run cancelled by client" },
        });

        sink.broadcast(runId, {
          type: "strategy_error" as const,
          runId,
          error: { code: "CANCELLED", message: "Run cancelled by client" },
          ts: new Date().toISOString(),
        });
      }

      // Clean up bridges
      const ctx = runContexts.get(runId);
      if (ctx) {
        ctx.inputBridge.destroy();
        ctx.permissionBridge.destroy();
        ctx.questionBridge.destroy();
        runContexts.delete(runId);
      }
    },

    handleUserInput(runId: string, agentName: string, text: string): boolean {
      const ctx = runContexts.get(runId);
      if (!ctx) return false;
      const resolved = ctx.inputBridge.resolveInput(agentName, text);
      if (resolved) {
        void runStore.appendEvent(runId, {
          type: "user_input",
          ts: new Date().toISOString(),
          agentName,
          text,
          source: "human",
        }).catch((err) => logger.warn(`Failed to append user_input event: ${err}`));
      }
      return resolved;
    },

    handlePermissionDecision(
      runId: string,
      permissionRequestId: string,
      decision: PermissionDecision,
    ): boolean {
      const ctx = runContexts.get(runId);
      if (!ctx) return false;
      const resolved = ctx.permissionBridge.resolvePermission(
        permissionRequestId,
        decision,
      );
      if (resolved) {
        void runStore.appendEvent(runId, {
          type: "permission_decision",
          ts: new Date().toISOString(),
          decision,
        }).catch((err) => logger.warn(`Failed to append permission_decision event: ${err}`));
      }
      return resolved;
    },

    handleQuestionResponse(
      runId: string,
      questionRequestId: string,
      response: string,
    ): boolean {
      const ctx = runContexts.get(runId);
      if (!ctx) return false;
      const resolved = ctx.questionBridge.resolveQuestion(
        questionRequestId,
        response,
      );
      if (resolved) {
        void runStore.appendEvent(runId, {
          type: "question_response",
          ts: new Date().toISOString(),
          response,
        }).catch((err) => logger.warn(`Failed to append question_response event: ${err}`));
      }
      return resolved;
    },

    handleUpdatePolicy(
      runId: string,
      patch: PolicyPatch,
      toolName?: string,
    ): boolean {
      const ctx = runContexts.get(runId);
      if (!ctx?.sandbox) return false;

      const cwd = ctx.sandbox.cwd;
      const policy = pathPolicy(
        patch.mode,
        {
          default: patch.default as "allow" | "deny" | "ask" | undefined,
          allow: patch.allow,
          deny: patch.deny,
        },
        cwd,
      );

      if (toolName) {
        // Apply to specific tool's guard
        const guard = ctx.sandbox.guardFor(toolName);
        guard.addPolicy(policy);
      } else {
        // Apply to all existing guards
        for (const [, guard] of ctx.sandbox.guards) {
          guard.addPolicy(policy);
        }
      }
      return true;
    },
  };
}
