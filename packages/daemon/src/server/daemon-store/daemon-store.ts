import type { DaemonStore } from "./daemon-store.types";
import { createRunStore } from "./run-store";

/**
 * Create the daemon-wide registry for connected clients and per-run stores.
 *
 * @returns {DaemonStore} The daemon-wide client and run-store registry.
 * @example
 * ```ts
 * const daemonStore = createDaemonStore();
 * const runStore = daemonStore.createRun("./strategy.ts", "strategy", process.cwd());
 * await runStore.transition({ type: "running" });
 * ```
 */
export function createDaemonStore(): DaemonStore {
  const runStores = new Map<string, ReturnType<typeof createRunStore>>();
  const clients = new Set<string>();

  return {
    createRun(strategyPath, strategyName, cwd, runId) {
      const runStore = createRunStore({
        id: runId,
        strategyPath,
        strategyName,
        cwd,
      });
      runStores.set(runStore.id, runStore);
      return runStore;
    },
    restoreRun(run) {
      const runStore = createRunStore({
        strategyPath: run.strategyPath,
        strategyName: run.strategyName,
        cwd: run.cwd,
        restoredRun: run,
      });
      runStores.set(runStore.id, runStore);
      return runStore;
    },
    getRunStore(runId) {
      return runStores.get(runId);
    },
    listRunStores() {
      return [...runStores.values()];
    },
    removeRun(runId) {
      const runStore = runStores.get(runId);
      if (!runStore) return false;
      runStores.delete(runId);
      runStore.dispose();
      return true;
    },
    addClient(clientId) {
      clients.add(clientId);
    },
    removeClient(clientId) {
      if (!clients.delete(clientId)) return;
      for (const runStore of runStores.values()) {
        runStore.removeSubscriber(clientId);
      }
    },
    getClients() {
      return [...clients];
    },
  };
}
