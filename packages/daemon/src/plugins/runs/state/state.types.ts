import type { ActiveRunMessage } from "../messages/messages.types";
import type { ChildRunEntry } from "../messages";
import type { RunHistoryStorage } from "../history/history.types";
import type { PluginNotifications } from "../../../daemon-plugin";
import type { LoadedStrategy } from "@comma-agents/core";
import type { HubManager } from "@comma-agents/core/hub";
import type { RunRepository } from "../../../daemon-run-state/run-repository";
import type { RunIdentity } from "../../../daemon-run-state/run-repository/run-repository.types";
import type {
  PrepareRunResult,
  RunError,
  RunOutcome,
  RunPreparationRegistration,
  RunSnapshot,
  StrategyHookRegistration,
} from "../runs.types";
import type { RunNotifications } from "../runs.notifications";

/** @internal Strategy ownership for one run's current lifecycle. */
export type RunLifecycle =
  | { readonly phase: "preparing" }
  | {
      readonly phase: "prepared";
      readonly strategy: LoadedStrategy;
    }
  | {
      readonly phase: "running";
      readonly strategy: LoadedStrategy;
    }
  | { readonly phase: "terminal" };

/** @internal Mutable state for one active or recently completed run. */
export interface RunEntry {
  snapshot: RunSnapshot;
  lifecycle: RunLifecycle;
  readonly controller: AbortController;
  readonly optionsKey: string;
  readonly previous?: RunSnapshot;
  readonly disposers: Array<() => Promise<void> | void>;
  readonly pendingInput: Map<string, PendingInput>;
  readonly steering: string[];
  readonly children: Set<Promise<unknown>>;
  settings?: {
    readonly manifestPath?: string;
    readonly modelOverride?: string;
  };
  preparation?: Promise<PrepareRunResult>;
  execution?: Promise<RunOutcome>;
  persistenceFailure?: RunError;
}

/** @internal Private run ID to current-state index owned by the runs plugin. */
export type PluginRunsState = Map<string, RunEntry>;

/** @internal Human-input request awaiting an answer. */
export interface PendingInput {
  readonly prompt: string;
  readonly agentName: string;
  resolving: boolean;
  readonly resolve: (text: string) => void;
  readonly reject: (reason: unknown) => void;
  readonly cleanup: () => void;
}

/** @internal State and resources owned exclusively by the runs plugin. */
export interface RunsContext {
  readonly history: RunHistoryStorage;
  readonly activeMessages: Map<string, ActiveRunMessage>;
  readonly childMarkers: Map<string, ChildRunEntry>;
  readonly pendingWrites: Set<Promise<void>>;
  readonly historyHydration: Map<string, Promise<void>>;
  readonly commands: Map<string, Promise<unknown>>;
  revision: number;
  readonly identities: Map<string, RunIdentity>;
  readonly runs: PluginRunsState;
  readonly notifications: PluginNotifications<RunNotifications>;
  readonly repository: RunRepository;
  readonly hubManager?: HubManager;
  readonly preparations: RunPreparationRegistration[];
  readonly hooks: StrategyHookRegistration[];
}
