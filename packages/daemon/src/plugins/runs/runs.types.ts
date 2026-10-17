import type { RunNotifications } from "./runs.notifications";
import type { RunIdentity } from "../../daemon-run-state/run-repository/run-repository.types";
export type { RunIdentity } from "../../daemon-run-state/run-repository/run-repository.types";
import type { NotifyingPlugin } from "../../daemon-plugin";
import type {
  AgentCallResult,
  ConversationHistory,
  TimelineEvent,
  LoadedStrategy,
  LoadStrategyOptions,
} from "@comma-agents/core";
import type { HubManager } from "@comma-agents/core/hub";

/** Services supplied by feature plugins to the strategy loader. */
export type StrategyLoaderInputs = Pick<
  LoadStrategyOptions,
  | "sandbox"
  | "skillRegistry"
  | "questionRequester"
  | "languageService"
  | "mcpToolsByAgent"
>;

/** Identify the strategy to prepare, or an existing run to continue. */
export interface PrepareRunOptions {
  /** Existing run ID; omit to create one. */
  readonly runId?: string;
  /** Strategy file; required for a new run. */
  readonly strategyPath?: string;
  /** Working directory; defaults to the previous run or current process. */
  readonly cwd?: string;
  /** Optional project manifest to load before the strategy. */
  readonly manifestPath?: string;
  /** Model selection applied to loaded agents. */
  readonly modelOverride?: string;
}

/** Details supplied to a feature before each root or child strategy loads. */
export interface RunPreparationContext {
  /** Identifier of this execution. */
  readonly runId: string;
  /** Whether this preparation belongs to the root or a child launch. */
  readonly kind: "root" | "child";
  /** Parent run identifier for a child launch. */
  readonly parentRunId?: string;
  /** Strategy file being loaded. */
  // Preparation needs load settings; LoadedStrategy is available in StrategyHookContext after loading.
  readonly strategyPath: string;
  /** Working directory for this strategy. */
  readonly cwd: string;
  /** Optional project manifest. */
  readonly manifestPath?: string;
  /** Optional model override. */
  readonly modelOverride?: string;
  /** Aborted when the run is stopped. */
  readonly signal: AbortSignal;
}

/** Run-scoped services and cleanup returned by a preparation provider. */
export interface RunPreparationResult {
  /** Typed services supplied to the strategy loader. */
  readonly strategyInputs?: Partial<StrategyLoaderInputs>;
  /** Release resources after execution, cancellation, or failed preparation. */
  readonly dispose?: () => Promise<void> | void;
}

/** Feature contribution invoked before each strategy load. */
export interface RunPreparationRegistration {
  /** Unique name among preparation registrations. */
  readonly name: string;
  /** Acquire services for this strategy invocation. */
  prepare(
    context: RunPreparationContext,
  ): Promise<RunPreparationResult> | RunPreparationResult;
}

/** Loaded strategy and run details supplied to a hook contributor. */
export interface StrategyHookContext extends RunPreparationContext {
  /** Freshly loaded strategy whose hooks can be extended. */
  readonly strategy: LoadedStrategy;
}

/** Feature contribution attached after each fresh strategy load. */
export interface StrategyHookRegistration {
  /** Unique name among hook registrations. */
  readonly name: string;
  /** Attach execution hooks to the loaded strategy. */
  attach(context: StrategyHookContext): Promise<void> | void;
}

/** JSON-safe final result stored with a completed run. */
export interface RunResultSummary {
  /** Persisted summary format version. */
  readonly version: 1;
  /** Final response text. */
  readonly text: string;
  /** Reason the strategy stopped. */
  readonly finishReason: string;
  /** Aggregate prompt and completion token counts. */
  readonly usage: AgentCallResult["usage"];
  /** Optional JSON-safe data from a strategy-specific result. */
  readonly data?: unknown;
}

/** Stable error code and readable explanation for a run failure. */
export interface RunError {
  /** Machine-readable error code. */
  readonly code: string;
  /** Human-readable error message. */
  readonly message: string;
}

/** Final outcome delivered by an execution handle. */
export type RunOutcome =
  | {
      readonly status: "completed";
      readonly result: AgentCallResult;
      readonly summary: RunResultSummary;
    }
  | { readonly status: "failed"; readonly error: RunError }
  | { readonly status: "cancelled"; readonly error: RunError }
  | {
      readonly status: "persistence_error";
      readonly error: RunError;
      readonly result?: AgentCallResult;
      readonly summary?: RunResultSummary;
    };

/** Current in-memory lifecycle phase for a run. */
export type RunPhase = "preparing" | "prepared" | "running" | "terminal";

/** Read-only view of one run's current or final state. */
export interface RunSnapshot extends RunIdentity {
  /** Stable run identifier across continuations. */
  readonly runId: string;
  /** Current lifecycle phase. */
  readonly phase: RunPhase;
  /** Strategy file used by this execution. */
  readonly strategyPath: string;
  /** Name reported by the loaded strategy. */
  readonly strategyName?: string;
  /** Working directory used by the strategy. */
  readonly cwd: string;
  /** Whether this execution starts or continues a run. */
  readonly mode: "new" | "continuation";
  /** Agent names available in a prepared strategy. */
  readonly agents?: readonly string[];
  /** Declared flow structure of a prepared strategy. */
  readonly flowTree?: LoadedStrategy["raw"]["flow"];
  /** Earlier conversation supplied during continuation preparation. */
  readonly conversation?: ConversationHistory;
  /** Saved agent names absent from the newly loaded strategy. */
  readonly unmatchedAgents?: readonly string[];
  /** Final result or failure when the run is terminal. */
  readonly outcome?:
    | { readonly status: "completed"; readonly summary: RunResultSummary }
    | {
        readonly status:
          "failed" | "cancelled" | "persistence_error" | "interrupted";
        readonly error?: RunError;
        readonly summary?: RunResultSummary;
      };
}

/** Handle returned immediately when execution begins. */
export interface RunExecutionHandle {
  /** Stable run identifier. */
  readonly runId: string;
  /** Resolves after the run reaches a terminal outcome and cleanup finishes. */
  readonly completion: Promise<RunOutcome>;
}

/** Prepared snapshot or a preparation cancelled before execution. */
export type PrepareRunResult =
  RunSnapshot | { readonly phase: "cancelled"; readonly runId: string };

/** Storage and feature dependencies for the serverless runs plugin. */
export interface CreateRunsPluginOptions {
  /** Directory used for persisted run timelines. */
  readonly runsDir: string;
  /** Installed-project manager used for code approval. */
  readonly hubManager?: HubManager;
}

/** Direct API for preparing, executing, observing, and continuing runs. */
export interface RunsPlugin extends NotifyingPlugin<"runs", RunNotifications> {
  /** Read this execution and its ancestors after preparation or history hydration. */
  getRunLineage(runId: string): readonly RunIdentity[];
  /** Register services to acquire when preparing a run. */
  registerRunPreparation(registration: RunPreparationRegistration): void;
  /** Register hooks to attach to every loaded strategy. */
  registerStrategyHooks(registration: StrategyHookRegistration): void;
  /** Load a new run or prepare a continuation. */
  prepareRun(options: PrepareRunOptions): Promise<PrepareRunResult>;
  /** Execute a newly prepared run. */
  startRun(runId: string, input?: string): RunExecutionHandle;
  /** Execute a prepared continuation under the same run ID. */
  continueRun(runId: string, input: string): RunExecutionHandle;
  /** Cancel preparation or execution and release resources. */
  stopRun(runId: string): Promise<void>;
  /** Queue text for the next agent call in a running strategy. */
  steerRun(runId: string, text: string): boolean;
  /** Answer one pending input request by its unique ID. */
  resolveInput(
    runId: string,
    requestId: string,
    text: string,
  ): Promise<boolean>;
  /** Read the current or persisted terminal snapshot. */
  getRun(runId: string): Promise<RunSnapshot | undefined>;
  /** Read the root-owned timeline containing this execution and its related executions. */
  getHistory(runId: string): Promise<readonly TimelineEvent[]>;
}
