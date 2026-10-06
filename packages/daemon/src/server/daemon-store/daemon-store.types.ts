import type { RunSnapshot, RunStore } from "./run-store";

export interface DaemonStore {
  createRun(
    strategyPath: string,
    strategyName: string,
    cwd: string,
    runId?: string,
  ): RunStore;
  restoreRun(run: RunSnapshot): RunStore;
  getRunStore(runId: string): RunStore | undefined;
  listRunStores(): readonly RunStore[];
  removeRun(runId: string): boolean;
  addClient(clientId: string): void;
  removeClient(clientId: string): void;
  getClients(): readonly string[];
}
