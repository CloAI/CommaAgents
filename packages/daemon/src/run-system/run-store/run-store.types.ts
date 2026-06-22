import type { TimelineEvent } from "@comma-agents/core";
import type { RunStatus } from "../../state/state.types";

/**
 * Lightweight metadata for listing runs (no events included).
 * Returned by `listRuns()` for efficient listing.
 */
export interface RunOverview {
  /** Stable identifier for the run. */
  readonly runId: string;
  /** Working directory used by the run. */
  readonly cwd: string;
  /** Human-readable strategy name. */
  readonly strategyName: string;
  /** Strategy file used by the run. */
  readonly strategyPath: string;
  /** ISO timestamp for when execution started. */
  readonly startedAt: string;
  /** ISO timestamp for completion, or `null` while unfinished. */
  readonly completedAt: string | null;
  /** Current or final run status. */
  readonly status: RunStatus;
}

/**
 * Persistent run store interface.
 * Stores each run as an append-only JSONL file of TimelineEvents: `<runsDir>/<runId>.jsonl`.
 */
export interface RunStore {
  /**
   * Append a single event to a run's timeline.
   * Creates the file if it doesn't exist.
   * Uses a per-run serialization queue to prevent concurrent write conflicts.
   */
  appendEvent(runId: string, event: TimelineEvent): Promise<void>;

  /**
   * Get all events for a specific run by ID.
   * Returns an empty array if the run timeline is not found or is empty.
   */
  getEvents(runId: string): Promise<readonly TimelineEvent[]>;

  /**
   * List runs, optionally filtered by cwd.
   * Synthesizes lightweight RunOverview[] by reading the first/last events.
   */
  listRuns(filter?: { cwd?: string }): Promise<readonly RunOverview[]>;

  /**
   * Delete a run timeline by ID. Returns true if it existed.
   */
  deleteRun(runId: string): Promise<boolean>;
}

/** Options for creating a run store. */
export interface CreateRunStoreOptions {
  /** Root directory for runs (e.g., `<dataDir>/runs`). */
  readonly runsDir: string;
}
