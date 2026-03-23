// Daemon state types — run tracking, client tracking, subscriptions.
//
// All operations are synchronous (in-memory, single-threaded event loop).
// The state module is a dumb data store — no event emission, no protocol
// knowledge. The executor and server decide when to send messages.

import type { AgentCallResult } from "@comma-agents/core";

// Run status

/**
 * Lifecycle status of a flow run.
 *
 * Matches the protocol's `RunSummarySchema.status` enum so conversion
 * to wire format is trivial.
 */
export type RunStatus = "pending" | "running" | "completed" | "error" | "cancelled";

// Run state

/**
 * Internal state of a single flow run.
 *
 * Immutable fields (`id`, `strategyPath`, `strategyName`, `startedAt`,
 * `abortController`) are set at creation and never change. Mutable fields
 * are updated via `DaemonState.updateRun()` which accepts `RunUpdate`.
 */
export interface RunState {
  /** Unique run identifier (UUID). */
  readonly id: string;
  /** Filesystem path to the strategy file. */
  readonly strategyPath: string;
  /** Human-readable strategy name (from the strategy schema). */
  readonly strategyName: string;
  /** When the run was created. */
  readonly startedAt: Date;
  /** AbortController for cancelling the run. */
  readonly abortController: AbortController;

  // Mutable fields — updated via RunUpdate
  /** Current lifecycle status. */
  status: RunStatus;
  /** When the run finished (completed, error, or cancelled). */
  completedAt?: Date;
  /** Final result (set when status transitions to "completed"). */
  result?: AgentCallResult;
  /** Error info (set when status transitions to "error"). */
  error?: { readonly code: string; readonly message: string };
}

// Run update — only mutable fields

/**
 * Mutable fields that can be changed via `DaemonState.updateRun()`.
 * Prevents accidental mutation of immutable fields like `id` or `startedAt`.
 */
export interface RunUpdate {
  status?: RunStatus;
  completedAt?: Date;
  result?: AgentCallResult;
  error?: { readonly code: string; readonly message: string };
}

// DaemonState interface

/**
 * Centralized daemon state — tracks active runs, connected clients,
 * and per-run subscriptions.
 *
 * All methods are synchronous. The state is in-memory only and is not
 * persisted across daemon restarts.
 *
 * **Invariants enforced:**
 * - `subscribe()` requires both client and run to exist (throws otherwise).
 * - `removeClient()` cleans up all subscriptions for that client.
 * - `removeRun()` cleans up the subscription set for that run.
 * - `addClient()` and `subscribe()` are idempotent (safe to call twice).
 * - `removeClient()` and `unsubscribe()` are no-ops for unknown entries.
 */
export interface DaemonState {
  // -- Runs --

  /** Create a new run with status "pending". Returns the created RunState. */
  createRun(strategyPath: string, strategyName: string): RunState;

  /** Get a run by ID, or undefined if not found. */
  getRun(runId: string): RunState | undefined;

  /** List all runs (snapshot — mutations to the array don't affect state). */
  listRuns(): ReadonlyArray<RunState>;

  /**
   * Update mutable fields of a run.
   * @throws If the run does not exist.
   */
  updateRun(runId: string, update: RunUpdate): void;

  /**
   * Remove a run and its subscription set.
   * @returns true if the run existed and was removed.
   */
  removeRun(runId: string): boolean;

  // -- Clients --

  /** Register a connected client. Idempotent. */
  addClient(clientId: string): void;

  /**
   * Remove a client and clean up all its subscriptions.
   * No-op if the client is not registered.
   */
  removeClient(clientId: string): void;

  /** List all connected client IDs. */
  getClients(): ReadonlyArray<string>;

  // -- Subscriptions --

  /**
   * Subscribe a client to a run's events.
   * Idempotent — subscribing twice is a no-op.
   * @throws If the client is not registered.
   * @throws If the run does not exist.
   */
  subscribe(clientId: string, runId: string): void;

  /**
   * Unsubscribe a client from a run's events.
   * No-op if the subscription does not exist.
   */
  unsubscribe(clientId: string, runId: string): void;

  /** Get all client IDs subscribed to a run. */
  getSubscribers(runId: string): ReadonlyArray<string>;

  /** Get all run IDs a client is subscribed to. */
  getSubscriptions(clientId: string): ReadonlyArray<string>;
}
