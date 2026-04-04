// Strategy executor — the bridge between the WebSocket layer and core's
// loadStrategy(). Manages strategy loading, event forwarding, user input
// collection, and state tracking.
//
// The executor orchestrates strategy execution at the highest level:
// 1. Pre-parses the strategy file to determine format and extract metadata.
// 2. Loads the strategy via core's loadStrategyFromString. Model and tool
//    resolution happen via global registries (registerModel / registerProvider /
//    registerTool / setGlobalCredentialStore).
// 3. Executes `strategy.flow.call(input)` in the background (fire-and-forget).
// 4. Updates DaemonState and broadcasts protocol messages as execution proceeds.

import type { AgentCallResult, AgentHooks, AgentStreamEvent, FlowHooks } from "@comma-agents/core";
import { hookIntoAgent, loadStrategyFromString } from "@comma-agents/core";
import YAML from "yaml";
import type { Logger } from "../logger";
import type { DaemonState, RunState } from "../state/state.types";
import type { EventSink } from "./event-sink";
import type { InputBridge } from "./input-bridge";
import { createInputBridge } from "./input-bridge";

// Types

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
  readonly clientId: string;
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
   * @returns The newly created run ID.
   */
  startRun(clientId: string, strategyPath: string, input?: string, requestId?: string): string;

  /**
   * Cancel a running strategy by run ID.
   * Aborts the execution, destroys bridges, and broadcasts `flow_error`.
   */
  stopRun(runId: string): void;

  /**
   * Route a `user_input` message to the correct run's input bridge.
   *
   * @returns `true` if the input was delivered to a pending request.
   */
  handleUserInput(runId: string, agentName: string, text: string): boolean;
}

// parseStrategyFile() — read and JSON/YAML parse a strategy file

/**
 * Read a strategy file and return the raw parsed object + format.
 * Does NOT validate with Zod — that's done by loadStrategyFromString.
 */
async function parseStrategyFile(
  filePath: string,
): Promise<{ raw: Record<string, unknown>; content: string; format: "json" | "yaml" }> {
  const ext = filePath.split(".").pop()?.toLowerCase();

  let format: "json" | "yaml";
  if (ext === "json") {
    format = "json";
  } else if (ext === "yaml" || ext === "yml") {
    format = "yaml";
  } else {
    throw new Error(`Unsupported strategy file extension: .${ext}`);
  }

  const file = Bun.file(filePath);
  if (!(await file.exists())) {
    throw new Error(`Strategy file not found: ${filePath}`);
  }

  const content = await file.text();
  const raw = format === "json" ? JSON.parse(content) : YAML.parse(content);

  return { raw, content, format };
}

// Helper: serialize AgentCallResult for wire

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
function toWireStreamEvent(event: AgentStreamEvent): Record<string, unknown> {
  if (event.type === "done") {
    return { type: "done", result: toWireResult(event.result) };
  }
  // Other event types are already wire-compatible
  return { ...event };
}

// createStrategyExecutor()

/**
 * Create a strategy executor.
 *
 * The executor is the orchestration layer that connects incoming
 * `start_flow` requests to core's `loadStrategy()` and manages the
 * full lifecycle: credential resolution, hook injection, event forwarding,
 * input/auth bridging, and state updates.
 */
export function createStrategyExecutor(options: CreateStrategyExecutorOptions): StrategyExecutor {
  const { state, sink, logger, bridgeTimeout = 0, modelOverride } = options;

  /** runId → per-run context (bridge, client). */
  const runContexts = new Map<string, RunContext>();

  // -- Private: build hooks that forward events to subscribers --

  function buildFlowHooks(runId: string): FlowHooks {
    return {
      beforeStep: [
        (ctx: { readonly stepName: string; readonly message: string }) => {
          sink.broadcast(runId, {
            type: "step_started" as const,
            runId,
            stepName: ctx.stepName,
            message: ctx.message,
            ts: new Date().toISOString(),
          });
        },
      ],
      afterStep: [
        (ctx: {
          readonly stepName: string;
          readonly message: string;
          readonly result: AgentCallResult;
        }) => {
          sink.broadcast(runId, {
            type: "step_completed" as const,
            runId,
            stepName: ctx.stepName,
            result: toWireResult(ctx.result),
            ts: new Date().toISOString(),
          });
        },
      ],
    };
  }

  function buildAgentHooks(runId: string): AgentHooks {
    return {
      onStreamEvent: [
        (event: AgentStreamEvent) => {
          // NOTE: The agentName is not available in the hook context.
          // We pass "unknown" and let clients correlate via step_started
          // messages which do carry the step name. A future core enhancement
          // could add agent name to the hook context.
          sink.broadcast(runId, {
            type: "agent_streaming" as const,
            runId,
            agentName: "unknown",
            event: toWireStreamEvent(event) as any,
            ts: new Date().toISOString(),
          });
        },
      ],
      afterCall: [
        (responseText: string) => {
          sink.broadcast(runId, {
            type: "agent_output" as const,
            runId,
            agentName: "unknown",
            text: responseText,
            usage: { promptTokens: 0, completionTokens: 0 },
            ts: new Date().toISOString(),
          });
        },
      ],
    };
  }

  // -- Private: executeRun — the async background task --

  async function executeRun(
    run: RunState,
    strategyPath: string,
    input: string,
    requestId: string | undefined,
  ): Promise<void> {
    const ctx = runContexts.get(run.id);
    if (!ctx) return;

    try {
      // 1. Parse the strategy file
      const { content, format } = await parseStrategyFile(strategyPath);

      // 2. Load the strategy — model and tool resolution happen via global registries
      const strategy = await loadStrategyFromString(content, format, {
        inputCollector: ctx.inputBridge.collector,
        flowHooks: buildFlowHooks(run.id),
        modelOverride,
      });

      // 3. Inject agent hooks into all loaded agents via hookIntoAgent
      const agentHooks = buildAgentHooks(run.id);
      for (const loadedAgent of Object.values(strategy.agents)) {
        if (loadedAgent.appendHook) {
          hookIntoAgent(loadedAgent, agentHooks);
        }
      }

      // 4. Update state to running
      state.updateRun(run.id, { status: "running" });

      // 5. Broadcast flow_started
      sink.broadcast(run.id, {
        type: "flow_started" as const,
        runId: run.id,
        strategyName: strategy.name,
        agents: Object.keys(strategy.agents),
        flowTree: strategy.raw.flow as unknown as Record<string, unknown>,
        ts: new Date().toISOString(),
        requestId,
      });

      // 6. Execute the strategy's entry flow
      const result = await strategy.flow.call(input);

      // 7. Success — update state and broadcast completion
      state.updateRun(run.id, {
        status: "completed",
        completedAt: new Date(),
        result,
      });

      sink.broadcast(run.id, {
        type: "flow_completed" as const,
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

      // Only update if the run still exists (may have been removed)
      const existingRun = state.getRun(run.id);
      if (existingRun && existingRun.status !== "cancelled") {
        state.updateRun(run.id, {
          status: errorStatus,
          completedAt: new Date(),
          error: { code: errorCode, message: errorMessage },
        });

        sink.broadcast(run.id, {
          type: "flow_error" as const,
          runId: run.id,
          error: { code: errorCode, message: errorMessage },
          ts: new Date().toISOString(),
          requestId,
        });
      }

      if (!isAbort) {
        logger.error(`Run ${run.id} failed: ${errorMessage}`);
      }
    } finally {
      // Clean up bridge
      const runContext = runContexts.get(run.id);
      if (runContext) {
        runContext.inputBridge.destroy();
        runContexts.delete(run.id);
      }
    }
  }

  // -- Public API --

  return {
    startRun(clientId: string, strategyPath: string, input?: string, requestId?: string): string {
      // 1. Create run in state (status: "pending")
      // Use the file path as a temporary name — the real name comes
      // from the strategy file after parsing.
      const run = state.createRun(strategyPath, strategyPath);

      // 2. Subscribe the requesting client to this run
      state.subscribe(clientId, run.id);

      // 3. Create input bridge for this run
      const inputBridge = createInputBridge({
        sink,
        runId: run.id,
        timeout: bridgeTimeout,
        abort: run.abortController.signal,
      });

      // 4. Store run context
      runContexts.set(run.id, { inputBridge, clientId });

      // 5. Kick off execution (fire-and-forget)
      executeRun(run, strategyPath, input ?? "", requestId).catch((caughtError) => {
        // This should never happen — executeRun has its own try/catch.
        // But log just in case.
        logger.error(`Unexpected error in executeRun for ${run.id}: ${caughtError}`);
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
          type: "flow_error" as const,
          runId,
          error: { code: "CANCELLED", message: "Run cancelled by client" },
          ts: new Date().toISOString(),
        });
      }

      // Clean up bridge
      const ctx = runContexts.get(runId);
      if (ctx) {
        ctx.inputBridge.destroy();
        runContexts.delete(runId);
      }
    },

    handleUserInput(runId: string, agentName: string, text: string): boolean {
      const ctx = runContexts.get(runId);
      if (!ctx) return false;
      return ctx.inputBridge.resolveInput(agentName, text);
    },
  };
}
