import type { RunOverview } from "@comma-agents/daemon";

export interface PersistedRunListResult {
  readonly persistedRuns: readonly RunOverview[];
  readonly fetchPersistedRuns: (cwd?: string) => void;
}
