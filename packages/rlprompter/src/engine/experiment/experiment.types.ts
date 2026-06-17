// Experiment data model + store contracts.
//
// An *experiment* pairs a base strategy + seed fixture with an ordered list of
// *iterations*. Each iteration records the prompt overrides applied, a derived
// summary of the run, and optional human feedback. The full timeline of every
// iteration is persisted separately as JSONL so the metadata index stays small.

import type { TimelineEvent } from "@comma-agents/core";
import type { PromptOverride } from "../overrides";
import type { RunIterationResult } from "../run-harness";

/** Compact, scannable summary of one iteration's run. */
export interface IterationSummary {
  /** The entry flow's final text output. */
  readonly text: string;
  /** Prompt tokens consumed across the run. */
  readonly promptTokens: number;
  /** Completion tokens produced across the run. */
  readonly completionTokens: number;
  /** Number of successful file mutations recorded. */
  readonly mutationCount: number;
  /** Terminal run status. */
  readonly status: "completed" | "error" | "cancelled";
}

/** Human reinforcement attached to an iteration after review. */
export interface IterationFeedback {
  /** Free-text reviewer notes. */
  readonly notes?: string;
  /** Optional manual quality score. */
  readonly score?: number;
}

/** One recorded run of the strategy within an experiment. */
export interface Iteration {
  /** Unique iteration id. */
  readonly id: string;
  /** 1-based position within the experiment. */
  readonly index: number;
  /** Creation timestamp (ISO-8601). */
  readonly createdAt: string;
  /** Input fed to the strategy for this iteration. */
  readonly input: string;
  /** Prompt overrides applied for this iteration. */
  readonly overrides: readonly PromptOverride[];
  /** Derived run summary. */
  readonly summary: IterationSummary;
  /** Human feedback, if reviewed. */
  readonly feedback?: IterationFeedback;
}

/** Top-level experiment metadata + iteration index. */
export interface Experiment {
  /** Unique experiment id. */
  readonly id: string;
  /** Human-friendly name. */
  readonly name: string;
  /** Creation timestamp (ISO-8601). */
  readonly createdAt: string;
  /** Absolute path of the base strategy file. */
  readonly strategyPath: string;
  /** Optional seed/fixture directory copied into each iteration's workdir. */
  readonly seedDir?: string;
  /** Optional model override applied to all iterations. */
  readonly modelOverride?: string;
  /** Ordered iteration index (metadata only; events live in JSONL). */
  readonly iterations: readonly Iteration[];
}

/** Lightweight listing entry. */
export interface ExperimentOverview {
  readonly id: string;
  readonly name: string;
  readonly createdAt: string;
  readonly strategyPath: string;
  readonly iterationCount: number;
}

/** Input to {@link ExperimentStore.create}. */
export interface CreateExperimentInput {
  readonly name: string;
  readonly strategyPath: string;
  readonly seedDir?: string;
  readonly modelOverride?: string;
}

/** Input to {@link ExperimentStore.appendIteration}. */
export interface AppendIterationInput {
  readonly input: string;
  readonly overrides: readonly PromptOverride[];
  readonly result: RunIterationResult;
  readonly feedback?: IterationFeedback;
}

/** File-backed store for experiments and their iteration timelines. */
export interface ExperimentStore {
  /** Create a new experiment directory + metadata file. */
  create(input: CreateExperimentInput): Promise<Experiment>;
  /** Load an experiment's metadata (without iteration events). */
  load(experimentId: string): Promise<Experiment>;
  /** List all experiments, newest first. */
  list(): Promise<readonly ExperimentOverview[]>;
  /** Append an iteration, persisting its timeline as JSONL. */
  appendIteration(
    experimentId: string,
    input: AppendIterationInput,
  ): Promise<Iteration>;
  /** Read the full timeline of a persisted iteration. */
  getIterationEvents(
    experimentId: string,
    iterationId: string,
  ): Promise<readonly TimelineEvent[]>;
  /** Attach or replace an iteration's human feedback. */
  setIterationFeedback(
    experimentId: string,
    iterationId: string,
    feedback: IterationFeedback,
  ): Promise<Iteration>;
  /** Delete an experiment and all its iterations. Returns false if absent. */
  delete(experimentId: string): Promise<boolean>;
}

/** Options for {@link createExperimentStore}. */
export interface CreateExperimentStoreOptions {
  /** Root directory holding per-experiment folders. Defaults to `./.rlprompter`. */
  readonly rootDir?: string;
}
