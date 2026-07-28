import type { AgentCallResult } from "@comma-agents/core";

/** Lifecycle status of a strategy run. */
export type RunStatus =
  | "pending"
  | "running"
  | "completed"
  | "error"
  | "cancelled";

/** Error information retained for a failed or cancelled run. @internal */
export interface RunError {
  /** Stable machine-readable error code. */
  readonly code: string;
  /** Human-readable error description. */
  readonly message: string;
}

/** Immutable view of a strategy run returned across the store boundary. @internal */
export interface RunSnapshot {
  /** Unique run identifier. */
  readonly id: string;
  /** Filesystem path to the strategy file. */
  readonly strategyPath: string;
  /** Human-readable strategy name. */
  readonly strategyName: string;
  /** When the run was created. */
  readonly startedAt: Date;
  /** Absolute working directory associated with the run. */
  readonly cwd: string;
  /** Current lifecycle status. */
  readonly status: RunStatus;
  /** When the run reached a terminal state. */
  readonly completedAt?: Date;
  /** Final result of a completed run. */
  readonly result?: AgentCallResult;
  /** Error information for a failed or cancelled run. */
  readonly error?: RunError;
}

/** Mutable authoritative run record retained inside the store. @internal */
export interface MutableRunRecord {
  /** Unique run identifier. */
  readonly id: string;
  /** Filesystem path to the strategy file. */
  readonly strategyPath: string;
  /** Human-readable strategy name. */
  readonly strategyName: string;
  /** When the run was created. */
  readonly startedAt: Date;
  /** Store-owned cancellation controller. */
  readonly abortController: AbortController;
  /** Absolute working directory associated with the run. */
  readonly cwd: string;
  /** Current lifecycle status. */
  status: RunStatus;
  /** When the run reached a terminal state. */
  completedAt?: Date;
  /** Final result of a completed run. */
  result?: AgentCallResult;
  /** Error information for a failed or cancelled run. */
  error?: RunError;
}

/** Successful state transition emitted by the daemon store. @internal */
export type DaemonAction =
  | { readonly type: "run.created"; readonly run: RunSnapshot }
  | {
      readonly type: "run.started";
      readonly previousRun: RunSnapshot;
      readonly run: RunSnapshot;
    }
  | {
      readonly type: "run.completed";
      readonly previousRun: RunSnapshot;
      readonly run: RunSnapshot;
    }
  | {
      readonly type: "run.failed";
      readonly previousRun: RunSnapshot;
      readonly run: RunSnapshot;
    }
  | {
      readonly type: "run.cancelled";
      readonly previousRun: RunSnapshot;
      readonly run: RunSnapshot;
    }
  | {
      readonly type: "run.removed";
      readonly run: RunSnapshot;
      readonly removedClientIds: readonly string[];
    }
  | { readonly type: "client.added"; readonly clientId: string }
  | {
      readonly type: "client.removed";
      readonly clientId: string;
      readonly removedRunIds: readonly string[];
    }
  | {
      readonly type: "subscription.added";
      readonly clientId: string;
      readonly runId: string;
    }
  | {
      readonly type: "subscription.removed";
      readonly clientId: string;
      readonly runId: string;
    };

/** Listener invoked synchronously after a successful transition. @internal */
export type DaemonActionListener = (action: DaemonAction) => void;

/**
 * In-memory authority for daemon runs, clients, and subscriptions.
 *
 * @example
 * ```ts
 * const run = daemonStore.createRun("./strategy.ts", "strategy", process.cwd());
 * daemonStore.startRun(run.id);
 * ```
 * @internal
 */
export interface DaemonStore {
  /** Create a pending run and return its immutable snapshot. */
  createRun(
    strategyPath: string,
    strategyName: string,
    cwd: string,
    runId?: string,
  ): RunSnapshot;
  /** Restore an existing run snapshot with new cancellation ownership. */
  restoreRun(run: RunSnapshot): RunSnapshot;
  /** Return an immutable run snapshot, or undefined when it does not exist. */
  getRun(runId: string): RunSnapshot | undefined;
  /** List immutable snapshots of every tracked run. */
  listRuns(): readonly RunSnapshot[];
  /** Return the store-owned cancellation signal for a run. */
  getAbortSignal(runId: string): AbortSignal;
  /** Transition a pending run to running. */
  startRun(runId: string): void;
  /** Complete a running run with its final result. */
  completeRun(runId: string, result: AgentCallResult): void;
  /** Fail a pending or running run with error information. */
  failRun(runId: string, error: RunError): void;
  /** Abort and cancel a pending or running run. */
  cancelRun(runId: string, error?: RunError): void;
  /** Remove a run and its subscriptions, returning whether it existed. */
  removeRun(runId: string): boolean;
  /** Register a connected client idempotently. */
  addClient(clientId: string): void;
  /** Remove a client and all of its run subscriptions. */
  removeClient(clientId: string): void;
  /** List every connected client identifier. */
  getClients(): readonly string[];
  /** Subscribe a registered client to an existing run idempotently. */
  subscribe(clientId: string, runId: string): void;
  /** Remove a client subscription when it exists. */
  unsubscribe(clientId: string, runId: string): void;
  /** List client identifiers subscribed to a run. */
  getSubscribers(runId: string): readonly string[];
  /** List run identifiers to which a client is subscribed. */
  getSubscriptions(clientId: string): readonly string[];
  /** Observe successful transitions and return an unsubscribe function. */
  subscribeToActions(listener: DaemonActionListener): () => void;
}
