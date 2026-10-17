import { getLogger } from "@logtape/logtape";
import type {
  AgentCallResult,
  AgentStreamEvent,
  InputCollector,
  InputRequest,
  LaunchStrategyHandle,
  LoadedStrategy,
} from "@comma-agents/core";
import { restoreAgentContexts } from "../../../daemon-run-state/daemon-run-state.utils";
import type {
  RunError,
  RunOutcome,
  RunResultSummary,
  RunExecutionHandle,
  RunPreparationContext,
  StrategyLoaderInputs,
} from "../runs.types";
import type { RunEntry, RunsContext } from "../state/state.types";
import { updateRunSnapshot } from "../state";
import { appendRunEvent, PersistenceFailure } from "../history";
import {
  cleanupRunEntry,
  throwIfRunAborted,
  mergeStrategyInputs,
  resultSummary,
  loadRunStrategy,
} from "./execution.utils";
import { registerRunIdentity } from "../identity";
import type { LoadedRunScope } from "./execution.types";

const logger = getLogger(["comma", "daemon", "plugins", "runs", "runtime"]);

/**
 * Start the execution mode selected during preparation.
 * @param {RunsContext} context - Private runs state.
 * @param {string} runId - Prepared run identifier.
 * @param {string} input - Input for this execution.
 * @param {"new" | "continuation"} expectedMode - Required preparation mode.
 * @returns {RunExecutionHandle} Handle for awaiting completion.
 * @internal
 */
export function beginRunExecution(
  context: RunsContext,
  runId: string,
  input: string,
  expectedMode: "new" | "continuation",
): RunExecutionHandle {
  const entry = context.runs.get(runId);
  if (!entry || entry.lifecycle.phase !== "prepared") {
    throw new Error(`Prepared run not found: ${runId}`);
  }
  if (entry.snapshot.mode !== expectedMode) {
    throw new Error(`Run ${runId} was prepared for ${entry.snapshot.mode}`);
  }
  if (entry.execution) throw new Error(`Run already started: ${runId}`);
  entry.lifecycle = { phase: "running", strategy: entry.lifecycle.strategy };
  entry.execution = executeRun(context, entry, input);
  return { runId, completion: entry.execution };
}

/**
 * Cancel preparation or execution and await its cleanup.
 * @param {RunsContext} context - Private runs state.
 * @param {string} runId - Run to stop.
 * @returns {Promise<void>} Resolves after active work and cleanup finish.
 * @internal
 */
export async function stopRun(
  context: RunsContext,
  runId: string,
): Promise<void> {
  const entry = context.runs.get(runId);
  if (!entry || entry.snapshot.phase === "terminal") return;
  entry.controller.abort();
  if (entry.preparation && entry.snapshot.phase === "preparing") {
    await entry.preparation;
  } else if (entry.execution) {
    await entry.execution;
  } else if (entry.snapshot.phase === "prepared") {
    await cleanupRunEntry(entry);
    context.runs.delete(runId);
    context.notifications.notify(runId, {
      type: "run_preparation_cancelled",
      runId,
    });
    if (entry.previous) {
      context.runs.set(runId, {
        ...entry,
        snapshot: entry.previous,
        lifecycle: { phase: "terminal" },
      });
      context.notifications.notify(runId, {
        type: "run_snapshot",
        snapshot: entry.previous,
      });
    }
  }
}

/**
 * Queue steering text for the next agent call.
 * @param {RunsContext} context - Private runs state.
 * @param {string} runId - Active run identifier.
 * @param {string} text - Steering message.
 * @returns {boolean} Whether the message was queued.
 * @internal
 */
export function steerRun(
  context: RunsContext,
  runId: string,
  text: string,
): boolean {
  const entry = context.runs.get(runId);
  if (!entry || entry.snapshot.phase !== "running") return false;
  entry.steering.push(text);
  context.notifications.notify(runId, {
    type: "run_steer_queued",
    runId,
    text,
  });
  return true;
}
/**
 * Persist a human answer before resolving its pending input request.
 * @param {RunsContext} context - Private runs state and repository.
 * @param {string} runId - Run awaiting the answer.
 * @param {string} requestId - Unique pending request identifier.
 * @param {string} text - Human answer.
 * @returns {Promise<boolean>} Whether the request was resolved.
 * @internal
 */
export async function resolveRunInput(
  context: RunsContext,
  runId: string,
  requestId: string,
  text: string,
): Promise<boolean> {
  const entry = context.runs.get(runId);
  const pending = entry?.pendingInput.get(requestId);
  if (!entry || !pending || pending.resolving) return false;
  pending.resolving = true;
  try {
    await appendRunEvent(context, runId, {
      type: "user_input",
      ts: new Date().toISOString(),
      requestId,
      agentName: pending.agentName,
      text,
      source: "human",
    });
  } catch (error) {
    entry.persistenceFailure = {
      code: "PERSISTENCE_ERROR",
      message: error instanceof Error ? error.message : String(error),
    };
    entry.controller.abort();
    throw error;
  }
  if (!entry.pendingInput.has(requestId)) return false;
  entry.pendingInput.delete(requestId);
  pending.cleanup();
  pending.resolve(text);
  return true;
}

/**
 * Stop active runs and release feature-owned references.
 * @param {RunsContext} context - Private runs state.
 * @returns {Promise<void>} Resolves after run cleanup finishes.
 * @internal
 */
export async function disposeRuns(context: RunsContext): Promise<void> {
  await Promise.allSettled(
    [...context.runs.values()]
      .filter((entry) => entry.snapshot.phase !== "terminal")
      .map((entry) => stopRun(context, entry.snapshot.runId)),
  );
  context.runs.clear();
}

function finish(
  context: RunsContext,
  entry: RunEntry,
  outcome: RunOutcome,
): RunOutcome {
  const snapshotOutcome =
    outcome.status === "completed"
      ? { status: "completed" as const, summary: outcome.summary }
      : {
          status: outcome.status,
          error: outcome.error,
          ...(outcome.status === "persistence_error" && outcome.summary
            ? { summary: outcome.summary }
            : {}),
        };
  entry.lifecycle = { phase: "terminal" };
  updateRunSnapshot(context, entry, {
    ...entry.snapshot,
    phase: "terminal",
    outcome: snapshotOutcome,
    flowTree: undefined,
    conversation: undefined,
  });
  return outcome;
}

/**
 * Execute a prepared run, persist its outcome, and notify its terminal snapshot.
 * @param {RunsContext} context - Private runs state and repository.
 * @param {RunEntry} entry - Run ready for execution.
 * @param {string} input - Initial input for this execution.
 * @returns {Promise<RunOutcome>} Outcome after child execution and cleanup finish.
 * @internal
 */
export async function executeRun(
  context: RunsContext,
  entry: RunEntry,
  input: string,
): Promise<RunOutcome> {
  const runId = entry.snapshot.runId;
  if (entry.lifecycle.phase !== "running") {
    throw new Error(`Run ${runId} is not ready to execute`);
  }
  const strategy = entry.lifecycle.strategy;
  let started = false;
  let completedResult: AgentCallResult | undefined;
  let completedSummary: RunResultSummary | undefined;
  let outcome: RunOutcome;
  try {
    await appendRunEvent(context, runId, {
      type: "run_started",
      ts: new Date().toISOString(),
      strategyPath: entry.snapshot.strategyPath,
      strategyName: strategy.name,
      cwd: entry.snapshot.cwd,
      initialInput: input,
      ...(entry.settings?.manifestPath
        ? { manifestPath: entry.settings.manifestPath }
        : {}),
      ...(entry.settings?.modelOverride
        ? { modelOverride: entry.settings.modelOverride }
        : {}),
    });
    started = true;
    throwIfRunAborted(entry.controller.signal);
    updateRunSnapshot(context, entry, { ...entry.snapshot, phase: "running" });
    const flowCall = strategy.flow.call(input);
    const abort = (): void => flowCall.abort();
    entry.controller.signal.addEventListener("abort", abort, { once: true });
    if (entry.controller.signal.aborted) abort();
    let result: AgentCallResult;
    try {
      result = await flowCall;
    } finally {
      entry.controller.signal.removeEventListener("abort", abort);
    }
    completedResult = result;
    await Promise.all(entry.children);
    throwIfRunAborted(entry.controller.signal);
    const summary = resultSummary(result);
    completedSummary = summary;
    await appendRunEvent(context, runId, {
      type: "run_completed",
      ts: new Date().toISOString(),
      status: "completed",
      result: summary,
    });
    outcome = { status: "completed", result, summary };
  } catch (caught) {
    const cancelled =
      entry.controller.signal.aborted ||
      (caught instanceof DOMException && caught.name === "AbortError");
    const persistence =
      caught instanceof PersistenceFailure ||
      entry.persistenceFailure !== undefined;
    let error: RunError = {
      code: persistence
        ? "PERSISTENCE_ERROR"
        : cancelled
          ? "CANCELLED"
          : "EXECUTION_ERROR",
      message:
        entry.persistenceFailure?.message ??
        (caught instanceof Error ? caught.message : String(caught)),
    };
    if (started) {
      try {
        await appendRunEvent(context, runId, {
          type: "run_completed",
          ts: new Date().toISOString(),
          status: persistence ? "error" : cancelled ? "cancelled" : "error",
          error,
        });
      } catch {
        error = { ...error, code: "PERSISTENCE_ERROR" };
      }
    }
    if (error.code === "PERSISTENCE_ERROR") {
      outcome = {
        status: "persistence_error",
        error,
        ...(completedResult
          ? {
              result: completedResult,
              ...(completedSummary ? { summary: completedSummary } : {}),
            }
          : {}),
      };
    } else {
      outcome = {
        status: cancelled ? "cancelled" : "failed",
        error,
      };
    }
  } finally {
    await Promise.allSettled(entry.children);
    await cleanupRunEntry(entry);
  }
  return finish(context, entry, outcome);
}
function createRunInputCollector(
  context: RunsContext,
  entry: RunEntry,
  scope: RunPreparationContext,
): InputCollector {
  return ({ agentName, prompt, signal }: InputRequest): Promise<string> => {
    throwIfRunAborted(entry.controller.signal);
    if (signal?.aborted) {
      throw new DOMException("Input stopped", "AbortError");
    }
    const requestId = crypto.randomUUID();
    return new Promise<string>((resolve, reject) => {
      const onAbort = (): void => {
        entry.pendingInput.delete(requestId);
        cleanupListeners();
        reject(new DOMException("Input stopped", "AbortError"));
      };
      const cleanupListeners = (): void => {
        entry.controller.signal.removeEventListener("abort", onAbort);
        signal?.removeEventListener("abort", onAbort);
      };
      entry.controller.signal.addEventListener("abort", onAbort, {
        once: true,
      });
      signal?.addEventListener("abort", onAbort, { once: true });
      entry.pendingInput.set(requestId, {
        agentName,
        resolving: false,
        resolve,
        reject,
        cleanup: cleanupListeners,
      });
      context.notifications.notify(entry.snapshot.runId, {
        type: "run_input_requested",
        runId: entry.snapshot.runId,
        requestId,
        ...(scope.parentRunId ? { parentRunId: scope.parentRunId } : {}),
        agentName,
        prompt,
      });
    });
  };
}

function attachRunHooks(
  context: RunsContext,
  entry: RunEntry,
  strategy: LoadedStrategy,
  scope: RunPreparationContext,
): void {
  const runId = entry.snapshot.runId;
  strategy.flow.appendHook?.(
    "beforeStep",
    async ({ stepName }: { stepName: string }) => {
      await appendRunEvent(context, runId, {
        type: "step_started",
        ts: new Date().toISOString(),
        stepName,
        ...(scope.parentRunId ? { parentRunId: scope.parentRunId } : {}),
      });
      context.notifications.notify(runId, {
        type: "run_step",
        runId,
        ...(scope.parentRunId ? { parentRunId: scope.parentRunId } : {}),
        phase: "started",
        stepName,
      });
    },
  );
  strategy.flow.appendHook?.(
    "afterStep",
    async ({ stepName }: { stepName: string }) => {
      await appendRunEvent(context, runId, {
        type: "step_completed",
        ts: new Date().toISOString(),
        stepName,
        ...(scope.parentRunId ? { parentRunId: scope.parentRunId } : {}),
      });
      context.notifications.notify(runId, {
        type: "run_step",
        runId,
        ...(scope.parentRunId ? { parentRunId: scope.parentRunId } : {}),
        phase: "completed",
        stepName,
      });
    },
  );

  for (const [agentName, agent] of Object.entries(strategy.agents)) {
    if (!agent.appendHook) continue;
    agent.appendHook("alterCallMessage", (message: string): string => {
      if (entry.steering.length === 0) return message;
      const block = entry.steering
        .splice(0)
        .map((text) => `<user_steering>\n${text}\n</user_steering>`)
        .join("\n\n");
      return message ? `${message}\n\n${block}` : block;
    });
    agent.appendHook("onStreamEvent", async (event: AgentStreamEvent) => {
      if (event.type === "retention") {
        await appendRunEvent(context, runId, {
          type: "conversation_retention",
          ts: event.event.createdAt,
          event: event.event,
          ...(scope.parentRunId ? { parentRunId: scope.parentRunId } : {}),
        });
      }
      context.notifications.notify(runId, {
        type: "run_agent_stream",
        runId,
        ...(scope.parentRunId ? { parentRunId: scope.parentRunId } : {}),
        agentName,
        event,
      });
    });
    agent.appendHook("afterCallResult", async (result: AgentCallResult) => {
      const record = agent.getConversationContext?.().records().at(-1);
      if (record) {
        await appendRunEvent(context, runId, {
          type: "agent_call",
          ts: record.createdAt,
          record,
          ...(scope.parentRunId ? { parentRunId: scope.parentRunId } : {}),
        });
      }
      context.notifications.notify(runId, {
        type: "run_agent_output",
        runId,
        ...(scope.parentRunId ? { parentRunId: scope.parentRunId } : {}),
        agentName,
        result,
      });
    });
  }
}

/**
 * Acquire scope resources, load the strategy, restore context, and attach hooks.
 * @param {RunsContext} context - Plugin-owned resources and registrations.
 * @param {RunEntry} entry - Root run owning this strategy invocation.
 * @param {RunPreparationContext} scope - Root or child preparation details.
 * @returns {Promise<LoadedRunScope>} Loaded strategy and acquired resource disposers.
 * @internal
 */
export async function loadRunForScope(
  context: RunsContext,
  entry: RunEntry,
  scope: RunPreparationContext,
): Promise<LoadedRunScope> {
  const disposers: Array<() => Promise<void> | void> = [];
  const strategyInputs: Partial<StrategyLoaderInputs> = {};
  const ownerByField = new Map<keyof StrategyLoaderInputs, string>();
  try {
    for (const registration of context.preparations) {
      throwIfRunAborted(scope.signal);
      const prepared = await registration.prepare(scope);
      if (prepared.dispose) disposers.push(prepared.dispose);
      if (prepared.strategyInputs) {
        mergeStrategyInputs(
          strategyInputs,
          prepared.strategyInputs,
          ownerByField,
          registration.name,
        );
      }
    }
    throwIfRunAborted(scope.signal);
    const launchStrategy: LaunchStrategyHandle = async (request) =>
      executeChildRun(context, entry, request);
    const strategy = await loadRunStrategy({
      strategyPath: scope.strategyPath,
      ...(scope.manifestPath ? { manifestPath: scope.manifestPath } : {}),
      ...(scope.modelOverride ? { modelOverride: scope.modelOverride } : {}),
      runId: scope.runId,
      inputCollector: createRunInputCollector(context, entry, scope),
      launchStrategy,
      strategyInputs,
      ...(context.hubManager ? { hubManager: context.hubManager } : {}),
    });
    throwIfRunAborted(scope.signal);
    if (entry.snapshot.mode === "continuation") {
      const history = entry.snapshot.conversation;
      if (history) restoreAgentContexts(strategy, history);
    }
    attachRunHooks(context, entry, strategy, scope);
    for (const registration of context.hooks) {
      throwIfRunAborted(scope.signal);
      await registration.attach({ ...scope, strategy });
    }
    return { strategy, disposers };
  } catch (error) {
    for (const dispose of disposers.reverse()) {
      try {
        await dispose();
      } catch (cleanupError) {
        logger.warning(
          `Preparation cleanup failed: ${cleanupError instanceof Error ? cleanupError.message : String(cleanupError)}`,
        );
      }
    }
    throw error;
  }
}

async function executeChildRun(
  context: RunsContext,
  parentEntry: RunEntry,
  request: Parameters<LaunchStrategyHandle>[0],
): Promise<Awaited<ReturnType<LaunchStrategyHandle>>> {
  throwIfRunAborted(parentEntry.controller.signal);
  const runId = crypto.randomUUID();
  const parentRunId = parentEntry.snapshot.runId;
  const childEntry: RunEntry = {
    snapshot: {
      runId,
      parentRunId,
      phase: "preparing",
      mode: "new",
      strategyPath: request.strategyPath,
      cwd: parentEntry.snapshot.cwd,
    },
    lifecycle: { phase: "preparing" },
    controller: new AbortController(),
    optionsKey: "",
    disposers: [],
    pendingInput: new Map(),
    steering: [],
    children: new Set(),
    settings: {
      ...(request.manifestPath ? { manifestPath: request.manifestPath } : {}),
      ...(request.modelOverride
        ? { modelOverride: request.modelOverride }
        : {}),
    },
  };
  const abort = (): void => childEntry.controller.abort();
  parentEntry.controller.signal.addEventListener("abort", abort, {
    once: true,
  });
  if (parentEntry.controller.signal.aborted) abort();
  const scope: RunPreparationContext = {
    runId,
    parentRunId,
    kind: "child",
    strategyPath: request.strategyPath,
    cwd: parentEntry.snapshot.cwd,
    ...childEntry.settings,
    signal: childEntry.controller.signal,
  };
  const child = (async () => {
    await registerRunIdentity(context, { runId, parentRunId });
    context.runs.set(runId, childEntry);
    context.notifications.notify(runId, {
      type: "run_snapshot",
      snapshot: childEntry.snapshot,
    });
    try {
      const prepared = await loadRunForScope(context, childEntry, scope);
      childEntry.disposers.push(...prepared.disposers);
      throwIfRunAborted(scope.signal);
      childEntry.lifecycle = { phase: "prepared", strategy: prepared.strategy };
      updateRunSnapshot(context, childEntry, {
        ...childEntry.snapshot,
        phase: "prepared",
        strategyName: prepared.strategy.name,
        agents: Object.keys(prepared.strategy.agents),
        flowTree: prepared.strategy.raw.flow,
      });
      const outcome = await beginRunExecution(
        context,
        runId,
        request.input,
        "new",
      ).completion;
      if (outcome.status === "completed") {
        return {
          strategyName: prepared.strategy.name,
          text: outcome.result.text,
          finishReason: outcome.result.finishReason,
        };
      }
      if (outcome.status === "persistence_error")
        throw new PersistenceFailure(outcome.error.message);
      if (outcome.status === "cancelled")
        throw new DOMException(outcome.error.message, "AbortError");
      throw new Error(outcome.error.message);
    } catch (error) {
      if (childEntry.lifecycle.phase !== "terminal") {
        await cleanupRunEntry(childEntry);
        finish(context, childEntry, {
          status: scope.signal.aborted ? "cancelled" : "failed",
          error: {
            code: scope.signal.aborted ? "CANCELLED" : "PREPARATION_ERROR",
            message: error instanceof Error ? error.message : String(error),
          },
        });
      }
      throw error;
    }
  })();
  parentEntry.children.add(child);
  try {
    return await child;
  } finally {
    parentEntry.children.delete(child);
    parentEntry.controller.signal.removeEventListener("abort", abort);
  }
}
