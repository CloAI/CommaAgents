import type { AgentCallResult } from "@comma-agents/core";
import { ALLOWED_RUN_STATUS_TRANSITIONS } from "./daemon-store.constants";
import type {
  DaemonAction,
  DaemonActionListener,
  DaemonStore,
  MutableRunRecord,
  RunError,
  RunSnapshot,
  RunStatus,
} from "./daemon-store.types";
import { createRunSnapshot } from "./daemon-store.utils";

/**
 * Create the in-memory store for daemon runs, clients, and subscriptions.
 *
 * @example
 * ```ts
 * const store = createDaemonStore();
 * const run = store.createRun("./strategy.ts", "strategy", process.cwd());
 * store.startRun(run.id);
 * ```
 * @internal
 */
export function createDaemonStore(): DaemonStore {
  const runs = new Map<string, MutableRunRecord>();
  const clients = new Set<string>();
  const subscriptions = new Map<string, Set<string>>();
  const actionListeners = new Set<DaemonActionListener>();

  function getRequiredRun(runId: string): MutableRunRecord {
    const run = runs.get(runId);
    if (!run) throw new Error(`Run not found: ${runId}`);
    return run;
  }

  function notifyActionListeners(action: DaemonAction): void {
    for (const actionListener of actionListeners) {
      actionListener(action);
    }
  }

  function transitionRun(
    runId: string,
    nextStatus: RunStatus,
    actionType:
      | "run.started"
      | "run.completed"
      | "run.failed"
      | "run.cancelled",
    result?: AgentCallResult,
    error?: RunError,
  ): void {
    const run = getRequiredRun(runId);
    if (!ALLOWED_RUN_STATUS_TRANSITIONS[run.status].has(nextStatus)) {
      throw new Error(
        `Invalid run status transition: ${run.status} -> ${nextStatus}`,
      );
    }

    const previousRun = createRunSnapshot(run);
    run.status = nextStatus;
    if (nextStatus === "completed") {
      run.completedAt = new Date();
      run.result = result;
      run.error = undefined;
    } else if (nextStatus === "error" || nextStatus === "cancelled") {
      run.completedAt = new Date();
      run.error = error;
      run.result = undefined;
    }

    const currentRun = createRunSnapshot(run);
    notifyActionListeners({ type: actionType, previousRun, run: currentRun });
  }

  return {
    createRun(strategyPath, strategyName, cwd, runId): RunSnapshot {
      const id = runId ?? crypto.randomUUID();
      const run: MutableRunRecord = {
        id,
        strategyPath,
        strategyName,
        status: "pending",
        startedAt: new Date(),
        abortController: new AbortController(),
        cwd,
      };
      runs.set(id, run);
      subscriptions.set(id, new Set());
      const snapshot = createRunSnapshot(run);
      notifyActionListeners({ type: "run.created", run: snapshot });
      return snapshot;
    },

    restoreRun(runSnapshot): RunSnapshot {
      const run: MutableRunRecord = {
        ...runSnapshot,
        abortController: new AbortController(),
      };
      runs.set(run.id, run);
      subscriptions.set(run.id, new Set());
      const snapshot = createRunSnapshot(run);
      notifyActionListeners({ type: "run.created", run: snapshot });
      return snapshot;
    },

    getRun(runId): RunSnapshot | undefined {
      const run = runs.get(runId);
      return run ? createRunSnapshot(run) : undefined;
    },

    listRuns(): readonly RunSnapshot[] {
      return Array.from(runs.values(), createRunSnapshot);
    },

    getAbortSignal(runId): AbortSignal {
      return getRequiredRun(runId).abortController.signal;
    },

    startRun(runId): void {
      transitionRun(runId, "running", "run.started");
    },

    completeRun(runId, result): void {
      transitionRun(runId, "completed", "run.completed", result);
    },

    failRun(runId, error): void {
      transitionRun(runId, "error", "run.failed", undefined, error);
    },

    cancelRun(
      runId,
      error = {
        code: "CANCELLED",
        message: "Run cancelled by client",
      },
    ): void {
      const run = getRequiredRun(runId);
      run.abortController.abort();
      if (run.status !== "pending" && run.status !== "running") return;
      transitionRun(runId, "cancelled", "run.cancelled", undefined, error);
    },

    removeRun(runId): boolean {
      const run = runs.get(runId);
      if (!run) return false;
      const removedClientIds = Array.from(subscriptions.get(runId) ?? []);
      runs.delete(runId);
      subscriptions.delete(runId);
      notifyActionListeners({
        type: "run.removed",
        run: createRunSnapshot(run),
        removedClientIds,
      });
      return true;
    },

    addClient(clientId): void {
      if (clients.has(clientId)) return;
      clients.add(clientId);
      notifyActionListeners({ type: "client.added", clientId });
    },

    removeClient(clientId): void {
      if (!clients.delete(clientId)) return;
      const removedRunIds: string[] = [];
      for (const [runId, subscribers] of subscriptions) {
        if (subscribers.delete(clientId)) removedRunIds.push(runId);
      }
      notifyActionListeners({
        type: "client.removed",
        clientId,
        removedRunIds,
      });
    },

    getClients(): readonly string[] {
      return Array.from(clients);
    },

    subscribe(clientId, runId): void {
      if (!clients.has(clientId))
        throw new Error(`Client not found: ${clientId}`);
      const subscribers = subscriptions.get(runId);
      if (!subscribers) throw new Error(`Run not found: ${runId}`);
      if (subscribers.has(clientId)) return;
      subscribers.add(clientId);
      notifyActionListeners({ type: "subscription.added", clientId, runId });
    },

    unsubscribe(clientId, runId): void {
      if (!subscriptions.get(runId)?.delete(clientId)) return;
      notifyActionListeners({ type: "subscription.removed", clientId, runId });
    },

    getSubscribers(runId): readonly string[] {
      return Array.from(subscriptions.get(runId) ?? []);
    },

    getSubscriptions(clientId): readonly string[] {
      const result: string[] = [];
      for (const [runId, subscribers] of subscriptions) {
        if (subscribers.has(clientId)) result.push(runId);
      }
      return result;
    },

    subscribeToActions(actionListener): () => void {
      actionListeners.add(actionListener);
      return (): void => {
        actionListeners.delete(actionListener);
      };
    },
  };
}
