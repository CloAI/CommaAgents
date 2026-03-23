// Strategy executor — the bridge between the WebSocket layer and core's
// loadStrategy(). Manages strategy loading, provider resolution, event
// forwarding, user input collection, and auth flows.
//
// The executor orchestrates strategy execution at the highest level:
// 1. Pre-parses the strategy file to extract provider IDs.
// 2. Resolves credentials for each provider (from store or via auth bridge).
// 3. Loads the strategy with injected hooks that forward events.
// 4. Executes `strategy.flow.call(input)` in the background (fire-and-forget).
// 5. Updates DaemonState and broadcasts protocol messages as execution proceeds.

import type {
  AgentCallResult,
  AgentHooks,
  AgentStreamEvent,
  FlowHooks,
  ProviderFactory,
} from "@comma-agents/core";
import { loadStrategy, loadStrategyFromString } from "@comma-agents/core";
import YAML from "yaml";

import type { CredentialStore } from "../credentials/types";
import type { Logger } from "../logger";
import type { Credential } from "../protocol/shared";
import type { DaemonState, RunState } from "../state/types";
import type { AuthBridge } from "./auth-bridge";
import { createAuthBridge } from "./auth-bridge";
import type { EventSink } from "./event-sink";
import type { InputBridge } from "./input-bridge";
import { createInputBridge } from "./input-bridge";

// Types

/**
 * A function that translates a (providerId, credential) pair into an
 * AI SDK ProviderFactory. Keeps the executor decoupled from @ai-sdk/*
 * packages — the server/CLI layer supplies the implementation.
 *
 * @example
 * ```ts
 * const resolver: ProviderResolver = async (id, cred) => {
 *   if (cred.type !== "api") throw new Error("Only API keys supported");
 *   const mod = await import(`@ai-sdk/${id}`);
 *   return mod.default({ apiKey: cred.key });
 * };
 * ```
 */
export type ProviderResolver = (
  providerId: string,
  credential: Credential,
) => ProviderFactory | Promise<ProviderFactory>;

/** Options for creating a strategy executor. */
export interface CreateStrategyExecutorOptions {
  /** Centralized daemon state for run/client/subscription tracking. */
  readonly state: DaemonState;
  /** EventSink for delivering messages to clients. */
  readonly sink: EventSink;
  /** Credential store for resolving and persisting credentials. */
  readonly credentialStore: CredentialStore;
  /** Logger for executor-level diagnostics. */
  readonly logger: Logger;
  /** Translates (providerId, credential) → ProviderFactory. */
  readonly providerResolver: ProviderResolver;
  /** Timeout in ms for input/auth bridges. 0 = no timeout. Default: 0. */
  readonly bridgeTimeout?: number;
  /**
   * Override the model for ALL agents in every strategy executed by this daemon.
   * Format: "providerID/modelID" (e.g., "github-copilot/gpt-4o").
   *
   * When set, ignores the model strings in strategy files and uses this
   * model for every LLM agent. The provider ID from the override is also
   * used for credential resolution.
   */
  readonly modelOverride?: string;
}

/** Per-run context held by the executor. */
interface RunContext {
  readonly inputBridge: InputBridge;
  readonly authBridge: AuthBridge;
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

  /**
   * Route a `provide_auth` message to the correct run's auth bridge.
   *
   * @returns `true` if the auth was delivered to a pending request.
   */
  handleProvideAuth(
    providerId: string,
    credential: Credential,
    scope: string,
    persist: boolean,
  ): Promise<boolean>;
}

// extractProviderIds() — pre-parse strategy to find required providers

/**
 * Extract unique provider IDs from a raw (already-parsed) strategy object.
 *
 * Scans `defaults.model` and each agent's `model` field for
 * "providerID/modelID" strings. Returns the set of unique provider IDs.
 */
export function extractProviderIds(raw: Record<string, unknown>): Set<string> {
  const ids = new Set<string>();

  // Helper: extract providerID from a "providerID/modelID" string
  const extract = (model: unknown): void => {
    if (typeof model !== "string") return;
    const slashIndex = model.indexOf("/");
    if (slashIndex > 0) {
      ids.add(model.slice(0, slashIndex));
    }
  };

  // Check defaults.model
  const defaults = raw.defaults as Record<string, unknown> | undefined;
  if (defaults) {
    extract(defaults.model);
  }

  // Check agents[*].model
  const agents = raw.agents as Record<string, Record<string, unknown>> | undefined;
  if (agents) {
    for (const agentDef of Object.values(agents)) {
      extract(agentDef.model);
    }
  }

  return ids;
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
  const {
    state,
    sink,
    credentialStore,
    logger,
    providerResolver,
    bridgeTimeout = 0,
    modelOverride,
  } = options;

  /** runId → per-run context (bridges, client). */
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
          // We don't have the agent name directly from the hook signature,
          // but the "done" event contains the result. For streaming events,
          // we use a generic name. The stepName from flow hooks provides
          // the context clients need.
          //
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

  // -- Private: resolve providers for a strategy --

  async function resolveProviders(
    providerIds: Set<string>,
    strategyName: string,
    authBridge: AuthBridge,
  ): Promise<Record<string, ProviderFactory>> {
    const providers: Record<string, ProviderFactory> = {};

    for (const providerId of providerIds) {
      // 1. Try credential store (strategy-scoped → env → global)
      let credential = await credentialStore.resolve(providerId, strategyName);

      // 2. If no credential, request from client via auth bridge
      if (!credential) {
        logger.debug(`No credential found for "${providerId}", requesting from client`);
        credential = await authBridge.requestAuth(providerId);
      }

      // 3. Translate credential → ProviderFactory
      const factory = await providerResolver(providerId, credential);
      providers[providerId] = factory;
    }

    return providers;
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
      // 1. Parse the strategy file to extract provider IDs
      const { raw, content, format } = await parseStrategyFile(strategyPath);

      // When modelOverride is set, use its provider ID instead of scanning
      // the strategy file. This ensures credentials are resolved for the
      // override provider, not the one baked into the strategy.
      let providerIds: Set<string>;
      if (modelOverride) {
        const slashIdx = modelOverride.indexOf("/");
        if (slashIdx < 1) {
          throw new Error(
            `Invalid modelOverride "${modelOverride}". Expected "providerID/modelID".`,
          );
        }
        providerIds = new Set([modelOverride.slice(0, slashIdx)]);
      } else {
        providerIds = extractProviderIds(raw as Record<string, unknown>);
      }

      const strategyName = typeof raw.name === "string" ? raw.name : "unknown";

      // 2. Resolve providers (may trigger auth bridge)
      const providers = await resolveProviders(providerIds, strategyName, ctx.authBridge);

      // 3. Load the strategy with injected hooks
      const strategy = loadStrategyFromString(content, format, {
        providers,
        inputCollector: ctx.inputBridge.collector,
        abort: run.abortController.signal,
        agentHooks: buildAgentHooks(run.id),
        flowHooks: buildFlowHooks(run.id),
        modelOverride,
      });

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
      // Clean up bridges
      const ctx = runContexts.get(run.id);
      if (ctx) {
        ctx.inputBridge.destroy();
        ctx.authBridge.destroy();
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

      // 3. Create bridges for this run
      const inputBridge = createInputBridge({
        sink,
        runId: run.id,
        timeout: bridgeTimeout,
        abort: run.abortController.signal,
      });

      const authBridge = createAuthBridge({
        sink,
        clientId,
        runId: run.id,
        credentialStore,
        strategyName: strategyPath, // Updated with real name during execution
        timeout: bridgeTimeout,
        abort: run.abortController.signal,
      });

      // 4. Store run context
      runContexts.set(run.id, { inputBridge, authBridge, clientId });

      // 5. Kick off execution (fire-and-forget)
      executeRun(run, strategyPath, input ?? "", requestId).catch((err) => {
        // This should never happen — executeRun has its own try/catch.
        // But log just in case.
        logger.error(`Unexpected error in executeRun for ${run.id}: ${err}`);
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

      // Clean up bridges
      const ctx = runContexts.get(runId);
      if (ctx) {
        ctx.inputBridge.destroy();
        ctx.authBridge.destroy();
        runContexts.delete(runId);
      }
    },

    handleUserInput(runId: string, agentName: string, text: string): boolean {
      const ctx = runContexts.get(runId);
      if (!ctx) return false;
      return ctx.inputBridge.resolveInput(agentName, text);
    },

    async handleProvideAuth(
      providerId: string,
      credential: Credential,
      scope: string,
      persist: boolean,
    ): Promise<boolean> {
      // Find the run context that has a pending auth request for this provider.
      // In practice, the server routes this by runId, but the provide_auth
      // message doesn't carry a runId — it carries a providerId.
      // We search all active run contexts for a match.
      for (const [, ctx] of runContexts) {
        const resolved = await ctx.authBridge.resolveAuth(providerId, credential, scope, persist);
        if (resolved) return true;
      }
      return false;
    },
  };
}
