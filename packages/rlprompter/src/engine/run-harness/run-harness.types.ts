// Run-harness types — contracts for executing one strategy iteration in an
// isolated temp workdir and capturing its text + file-mutation timeline.

import type {
  AgentCallResult,
  AgentStreamEvent,
  Strategy,
  TimelineEvent,
} from "@comma-agents/core";
import type { PromptOverride } from "../overrides";

/** A streaming token/tool event tagged with the agent that produced it. */
export interface TaggedStreamEvent {
  readonly agentName: string;
  readonly event: AgentStreamEvent;
}

/** Options for {@link runIteration}. */
export interface RunIterationOptions {
  /** The raw, validated base strategy (e.g. `LoadedStrategy.raw`). */
  readonly strategy: Strategy;
  /** Layered prompt overrides to apply before running. Defaults to none. */
  readonly overrides?: readonly PromptOverride[];
  /** Initial input fed to the strategy's entry flow. */
  readonly input: string;
  /**
   * Directory whose contents are copied into the fresh temp workdir before
   * the run. When omitted, the run starts from an empty temp directory.
   */
  readonly seedDir?: string;
  /**
   * Base directory of the original strategy file, used to resolve relative
   * paths (e.g. system-prompt file references) during load.
   */
  readonly strategyDir?: string;
  /** Override the model for every LLM agent ("providerID/modelID"). */
  readonly modelOverride?: string;
  /** Per-invocation run identifier propagated to tool contexts. */
  readonly runId?: string;
  /** Abort signal — aborts the in-flight flow when triggered. */
  readonly signal?: AbortSignal;
  /** Called for every timeline event as it is appended (live updates). */
  readonly onEvent?: (event: TimelineEvent) => void;
  /** Called for every streaming agent event (live token/tool updates). */
  readonly onStreamEvent?: (event: TaggedStreamEvent) => void;
}

/** Result of a single iteration run. */
export interface RunIterationResult {
  /** The full append-only timeline captured during the run. */
  readonly events: readonly TimelineEvent[];
  /** Absolute path of the temp workdir the run executed in. */
  readonly tempDir: string;
  /** The entry flow's final result (text, usage, finish reason). */
  readonly result: AgentCallResult;
  /** Run status — mirrors the trailing `run_completed` event. */
  readonly status: "completed" | "error" | "cancelled";
  /** Error details when `status` is "error". */
  readonly error?: { readonly code: string; readonly message: string };
}
