// Comparison types — the shape of a diff between two iterations.

import type { TimelineEvent } from "@comma-agents/core";

/** One side of a comparison: a labelled iteration's timeline. */
export interface CompareInput {
  /** Display label (e.g. "Iteration 1"). */
  readonly label: string;
  /** The iteration's full timeline. */
  readonly events: readonly TimelineEvent[];
}

/** How a single file differs between the two iterations. */
export interface FileChange {
  /** Workspace-relative path. */
  readonly path: string;
  /** Change classification from iteration A → B. */
  readonly status: "added" | "removed" | "changed" | "unchanged";
  /**
   * Unified diff describing the relevant edit: for added/changed this is B's
   * most recent mutation of the path; for removed it is A's. Empty when none.
   */
  readonly diff: string;
}

/** Full comparison between two iterations. */
export interface IterationComparison {
  /** Unified diff of the two iterations' final text outputs. */
  readonly textDiff: string;
  /** Per-file differences, sorted by path. Excludes paths unchanged in both. */
  readonly files: readonly FileChange[];
}
