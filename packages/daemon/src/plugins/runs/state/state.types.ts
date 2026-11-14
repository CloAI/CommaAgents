import type { RunStrategyState } from "../switching/switching.types";
import type { z } from "zod/v4";
import type { LoadedStrategy, StrategySwitchRequest } from "@comma-agents/core";
import type { PluginNotifications } from "../../../daemon-plugin";
import type { HubManager } from "@comma-agents/core/hub";
import type { ActiveRunMessage } from "../messages/messages.types";
import type { RunHistoryStorage } from "../history/history.types";
import type { RunStorage } from "./storage/storage.types";
import type { RunNotifications } from "../runs.notifications";
import type {
  HarnessSettings,
  RunOutcome,
  PrepareRunResult,
  RunPreparationRegistration,
  StrategyHookRegistration,
} from "../runs.types";
import type { RunConfiguration } from "../preparation/preparation.types";
import type { RunError } from "../errors";
import type {
  RunPreparingSnapshotSchema,
  RunPreparedSnapshotSchema,
  RunRunningSnapshotSchema,
  RunTerminalSnapshotSchema,
  RunStrategyDescriptionSchema,
  RunTerminalOutcomeSchema,
  RunResultSummarySchema,
} from "./state.schemas";
import { RunPhase } from "./state.schemas";
/** Recorded declared flow; executable functions are never persisted. */
export interface RecordedRunFlow {
  readonly name: string;
  readonly type: string;
  readonly description?: string;
  readonly steps: readonly RecordedRunFlowStep[];
  readonly cycles?: number | "Infinity";
  readonly observer?: string;
  readonly breakCycleSignals?: readonly string[];
  readonly breakCycleSignalMatch?:
    | "substring"
    | "first-line"
    | "any-line"
    | "exact";
  readonly separator?: string;
  readonly config?: Readonly<Record<string, z.infer<z.ZodJSONSchema>>>;
}
/** Agent references or nested declared flows. */
export type RecordedRunFlowStep =
  | { readonly agent: string; readonly description?: string }
  | RecordedRunFlow;
/** Serializable state while resource acquisition is pending. */
export type RunPreparingSnapshot = z.infer<typeof RunPreparingSnapshotSchema>;
/** Loaded state available for inspection before execution. */
export type RunPreparedSnapshot = z.infer<typeof RunPreparedSnapshotSchema>;
/** Serializable active execution state. */
export type RunRunningSnapshot = z.infer<typeof RunRunningSnapshotSchema>;
/** Final state retained after execution or preparation ends. */
export type RunTerminalSnapshot = z.infer<typeof RunTerminalSnapshotSchema>;
/** One phase determines which snapshot fields exist. */
export type RunSnapshot =
  | RunPreparingSnapshot
  | RunPreparedSnapshot
  | RunRunningSnapshot
  | RunTerminalSnapshot;
/** Description of the last successfully loaded strategy. */
export type RunStrategyDescription = z.infer<
  typeof RunStrategyDescriptionSchema
>;
/** Serializable terminal result without diagnostic prose. */
export type RunTerminalOutcome = z.infer<typeof RunTerminalOutcomeSchema>;
/** Final strategy output and reported usage. */
export type RunResultSummary = z.infer<typeof RunResultSummarySchema>;
/** Stable run identity and immediate ancestry. */
export interface RunIdentity {
  readonly runId: string;
  readonly parentRunId?: string;
}
/** A run that is executing now, with its immediate parent when it is a delegated child. */
export interface ActiveRun {
  readonly runId: string;
  readonly parentRunId?: string;
}
/** @internal A pending preparation owns its completion promise. */
export interface RunPreparingState {
  readonly phase: RunPhase.preparing;
  readonly preparation: Promise<PrepareRunResult>;
}
/** @internal A prepared run owns a loaded strategy. */
export interface RunPreparedState {
  readonly phase: RunPhase.prepared;
  readonly strategy: LoadedStrategy;
  readonly unmatchedAgents: readonly string[];
}
/** @internal Execution owns its strategy and completion promise. */
export interface RunRunningState {
  readonly phase: RunPhase.running;
  readonly strategy: LoadedStrategy;
  readonly completion: Promise<RunOutcome>;
}
/** @internal No executable resources remain in terminal state. */
export interface RunTerminalState {
  readonly phase: RunPhase.terminal;
  readonly outcome: RunTerminalOutcome;
}
/** @internal The only authoritative runtime phase. */
export type RunState =
  | RunPreparingState
  | RunPreparedState
  | RunRunningState
  | RunTerminalState;
/** @internal Human input waiting for one answer. */
export interface PendingInput {
  readonly prompt: string;
  readonly agentName: string;
  resolving: boolean;
  readonly resolve: (text: string) => void;
  readonly reject: (reason: unknown) => void;
  readonly cleanup: () => void;
}
/** @internal Private runtime resources allocated when preparing a run. */
export interface RunEntry extends RunIdentity {
  configuration: RunConfiguration;
  strategyState?: RunStrategyState;
  description: RunStrategyDescription | null;
  state: RunState;
  readonly controller: AbortController;
  readonly activators: Array<() => void>;
  readonly disposers: Array<() => Promise<void> | void>;
  cleanup: Promise<void> | null;
  readonly pendingInput: Map<string, PendingInput>;
  retryInput?: string;
  initialInput: { readonly agentName: string; readonly text: string } | null;
  /** Strategy an agent asked to switch to; applied when the run next waits for the user. */
  pendingStrategySwitch: StrategySwitchRequest | null;
  readonly children: Set<Promise<unknown>>;
  readonly activeMessages: Map<string, ActiveRunMessage>;
  readonly pendingWrites: Set<Promise<unknown>>;
  failure: RunError | null;
}
/** @internal Runs prepared by this daemon, indexed by identity. */
export type PluginRunsState = Map<string, RunEntry>;
/** @internal Private feature state. */
export interface RunsContext {
  readonly runsDir: string;
  readonly runs: PluginRunsState;
  readonly operations: Set<string>;
  readonly stagedStrategies: Map<
    string,
    { readonly entry: RunEntry; readonly completion: Promise<void> }
  >;
  readonly identities: Map<string, RunIdentity>;
  readonly storage: RunStorage;
  readonly history: RunHistoryStorage;
  readonly notifications: PluginNotifications<RunNotifications>;
  readonly hubManager?: HubManager;
  readonly harness?: HarnessSettings;
  readonly preparations: RunPreparationRegistration[];
  readonly hooks: StrategyHookRegistration[];
}

/** Validation boundary for a recorded flow, preserving its JSON input and typed output. */
export interface RecordedRunFlowSchema extends z.ZodType<
  RecordedRunFlow,
  z.input<z.ZodJSONSchema>
> {}
