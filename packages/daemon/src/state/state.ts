import type { DaemonState, RunState, RunUpdate } from "./state.types";

/**
 * Create a new in-memory daemon state instance.
 *
 * Tracks runs, connected clients, and per-run subscriptions.
 * All operations are synchronous (single-threaded event loop).
 *
 * @example
 * ```ts
 * const state = createDaemonState();
 * const run = state.createRun("./strategy.ts", "myStrategy", "/cwd", "session-1");
 * state.updateRun(run.id, { status: "running" });
 * ```
 */
export function createDaemonState(): DaemonState {
  /** Run ID → RunState. */
  const runs = new Map<string, RunState>();
  /** Connected client IDs. */
  const clients = new Set<string>();
  /** Run ID → set of subscribed client IDs. */
  const subscriptions = new Map<string, Set<string>>();

  return {
    createRun(
      strategyPath: string,
      strategyName: string,
      cwd: string,
      sessionId: string,
    ): RunState {
      const id = crypto.randomUUID();
      const run: RunState = {
        id,
        strategyPath,
        strategyName,
        status: "pending",
        startedAt: new Date(),
        abortController: new AbortController(),
        cwd,
        sessionId,
      };
      runs.set(id, run);
      subscriptions.set(id, new Set());
      return run;
    },

    getRun(runId: string): RunState | undefined {
      return runs.get(runId);
    },

    listRuns(): ReadonlyArray<RunState> {
      return Array.from(runs.values());
    },

    updateRun(runId: string, update: RunUpdate): void {
      const run = runs.get(runId);
      if (!run) {
        throw new Error(`Run not found: ${runId}`);
      }

      if (update.status !== undefined) run.status = update.status;
      if (update.completedAt !== undefined)
        run.completedAt = update.completedAt;
      if (update.result !== undefined) run.result = update.result;
      if (update.error !== undefined) run.error = update.error;
    },

    removeRun(runId: string): boolean {
      if (!runs.has(runId)) return false;
      runs.delete(runId);
      subscriptions.delete(runId);
      return true;
    },

    addClient(clientId: string): void {
      clients.add(clientId);
    },

    removeClient(clientId: string): void {
      if (!clients.delete(clientId)) return;

      // Clean up all subscriptions for this client.
      for (const subscribers of subscriptions.values()) {
        subscribers.delete(clientId);
      }
    },

    getClients(): ReadonlyArray<string> {
      return Array.from(clients);
    },

    subscribe(clientId: string, runId: string): void {
      if (!clients.has(clientId)) {
        throw new Error(`Client not found: ${clientId}`);
      }
      const subscribers = subscriptions.get(runId);
      if (!subscribers) {
        throw new Error(`Run not found: ${runId}`);
      }
      subscribers.add(clientId);
    },

    unsubscribe(clientId: string, runId: string): void {
      subscriptions.get(runId)?.delete(clientId);
    },

    getSubscribers(runId: string): ReadonlyArray<string> {
      const subscribers = subscriptions.get(runId);
      if (!subscribers) return [];
      return Array.from(subscribers);
    },

    getSubscriptions(clientId: string): ReadonlyArray<string> {
      const result: string[] = [];
      for (const [runId, subscribers] of subscriptions) {
        if (subscribers.has(clientId)) {
          result.push(runId);
        }
      }
      return result;
    },
  };
}
