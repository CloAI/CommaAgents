import type { Strategy, TimelineEvent } from "@comma-agents/core";
import type {
  CreateExperimentInput,
  Experiment,
  ExperimentOverview,
  IterationFeedback,
  PromptOverride,
} from "../../engine";

/** Live state captured while an iteration is executing. */
export interface LiveRunState {
  /** True while a run is in flight. */
  readonly running: boolean;
  /** Accumulated streaming text from the latest run. */
  readonly text: string;
  /** Timeline events appended so far during the latest run. */
  readonly events: readonly TimelineEvent[];
  /** Error message if the last run failed to start/execute. */
  readonly error: string | null;
}

/** The full experiment context surface consumed by pages. */
export interface ExperimentContextValue {
  /** All known experiments (newest first). */
  readonly experiments: readonly ExperimentOverview[];
  /** Currently opened experiment, or null on the picker. */
  readonly active: Experiment | null;
  /** Raw base strategy of the active experiment (overrides apply on top). */
  readonly baseStrategy: Strategy | null;
  /** Overrides queued from feedback, applied on the next iteration. */
  readonly queuedOverrides: readonly PromptOverride[];
  /** Live run state for the in-flight / latest iteration. */
  readonly live: LiveRunState;
  /** Iteration id selected for detail view. */
  readonly selectedIterationId: string | null;
  /** Up to two iteration ids selected for comparison. */
  readonly compareSelection: readonly string[];

  /** Reload the experiment list from disk. */
  refresh(): Promise<void>;
  /** Create an experiment and open it. */
  createExperiment(input: CreateExperimentInput): Promise<void>;
  /** Open an existing experiment by id. */
  openExperiment(id: string): Promise<void>;
  /** Return to the picker (clears active experiment). */
  closeExperiment(): void;

  /** Queue a prompt override for the next iteration. */
  queueOverride(override: PromptOverride): void;
  /** Remove a queued override by index. */
  removeQueuedOverride(index: number): void;
  /** Clear all queued overrides. */
  clearQueue(): void;

  /** Run the next iteration with the queued overrides; persists + clears queue. */
  runNextIteration(input: string): Promise<void>;
  /** Attach human feedback to an iteration. */
  submitFeedback(
    iterationId: string,
    feedback: IterationFeedback,
  ): Promise<void>;

  /** Select an iteration for detail view. */
  selectIteration(id: string | null): void;
  /** Read a persisted iteration's full timeline. */
  getIterationEvents(iterationId: string): Promise<readonly TimelineEvent[]>;
  /** Toggle an iteration's membership in the compare selection (max 2). */
  toggleCompare(id: string): void;
}
