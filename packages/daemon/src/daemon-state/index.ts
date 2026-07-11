// State barrel — re-exports state factory and types.

export { createDaemonState } from "./daemon-state";
export type {
  DaemonState,
  RunState,
  RunStatus,
  RunUpdate,
} from "./daemon-state.types";
