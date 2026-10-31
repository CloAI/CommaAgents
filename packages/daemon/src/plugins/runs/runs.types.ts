import type {
  SwitchStrategyOptions,
  SendRunOptions,
  SendRunResult,
} from "./switching";
import type { RunHistoryOptions, RunHistoryPage } from "./history";
import type { RunNotifications } from "./runs.notifications";

export type { RunIdentity } from "./state/state.types";
import type { NotifyingPlugin } from "../../daemon-plugin";
import type {
  AgentCallResult,
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

export type {
  PrepareRunOptions,
  PrepareNewRunOptions,
  PrepareExistingRunOptions,
  RunConfiguration,
  NewRunConfiguration,
  RunConfigurationOverrides,
} from "./preparation/preparation.types";
import type {
  PrepareRunOptions,
  RunConfiguration,
} from "./preparation/preparation.types";
export { RunPhase, RunOutcomeStatus } from "./state/state.schemas";
export { RunErrorCode } from "./errors";
export type { RunError } from "./errors";
export type {
  RunSnapshot,
  RunStrategyDescription,
  RunPreparingSnapshot,
  RunPreparedSnapshot,
  RunRunningSnapshot,
  RunTerminalSnapshot,
  RunTerminalOutcome,
  RunResultSummary,
} from "./state/state.types";
import type {
  RunIdentity,
  RunSnapshot,
  RunTerminalOutcome,
  RunResultSummary,
} from "./state/state.types";

/** Shared resolved settings available before each strategy load. */
interface RunPreparationContextBase extends RunConfiguration {
  readonly runId: string;
  readonly signal: AbortSignal;
  /** Acquire a replacement without replacing the current run's published feature resources. */
  readonly staged?: boolean;
}
/** Preparation of a root conversation has no parent. */
export interface RunRootPreparationContext extends RunPreparationContextBase {
  readonly kind: "root";
  readonly parentRunId?: never;
}
/** Child preparation always identifies its immediate parent. */
export interface RunChildPreparationContext extends RunPreparationContextBase {
  readonly kind: "child";
  readonly parentRunId: string;
}
/** Fully resolved settings and ownership supplied to feature preparation. */
export type RunPreparationContext =
  | RunRootPreparationContext
  | RunChildPreparationContext;

/** Run-scoped services and cleanup returned by a preparation provider. */
export interface RunPreparationResult {
  /** Typed services supplied to the strategy loader. */
  readonly strategyInputs: StrategyLoaderInputs;
  /** Synchronously publish staged resources after the run commits. Must not throw. */
  readonly activate?: () => void;
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
export type StrategyHookContext = RunPreparationContext & {
  readonly strategy: LoadedStrategy;
};

/** Feature contribution attached after each fresh strategy load. */
export interface StrategyHookRegistration {
  /** Unique name among hook registrations. */
  readonly name: string;
  /** Attach execution hooks to the loaded strategy. */
  attach(context: StrategyHookContext): Promise<void> | void;
}

/** A completed execution includes its direct result; other outcomes carry only terminal state. */
export type RunOutcome =
  | Exclude<
      RunTerminalOutcome,
      { status: import("./state/state.schemas").RunOutcomeStatus.completed }
    >
  | {
      readonly status: import("./state/state.schemas").RunOutcomeStatus.completed;
      readonly result: AgentCallResult;
      readonly summary: RunResultSummary;
    };

/** Handle returned immediately when execution begins. */
export interface RunExecutionHandle {
  /** Stable run identifier. */
  readonly runId: string;
  /** Resolves after the run reaches a terminal outcome and cleanup finishes. */
  readonly completion: Promise<RunOutcome>;
}

/** Final preparation state, including a stopped preparation. */
export type PrepareRunResult =
  | import("./state/state.types").RunPreparedSnapshot
  | import("./state/state.types").RunTerminalSnapshot;

/** Storage and feature dependencies for the serverless runs plugin. */
export interface CreateRunsPluginOptions {
  /** Directory containing independent run documents, conversation records, and display history. */
  readonly runsDir: string;
  /** Installed-project manager used for code approval. */
  readonly hubManager?: HubManager;
  /** User-level harness settings applied to every strategy load. */
  readonly harness?: HarnessSettings;
}

/** User-level settings that shape how strategies build their agents. */
export interface HarnessSettings {
  /** Models for `@role` references; these win over each strategy's `modelRoles`. */
  readonly modelRoles?: Readonly<Record<string, string>>;
  /** Instruction file names checked per directory for project instruction blocks. */
  readonly instructionFiles?: readonly string[];
}

/** Direct API for preparing, executing, observing, and continuing runs. */
export interface RunsPlugin extends NotifyingPlugin<"runs", RunNotifications> {
  /** Read this execution and its ancestors after preparation or reading saved metadata. */
  getRunLineage(runId: string): readonly RunIdentity[];
  /** Register services to acquire when preparing a run. */
  registerRunPreparation(registration: RunPreparationRegistration): void;
  /** Register hooks to attach to every loaded strategy. */
  registerStrategyHooks(registration: StrategyHookRegistration): void;
  /** Load a new conversation or prepare a saved run with optional configuration overrides. */
  prepareRun(options: PrepareRunOptions): Promise<PrepareRunResult>;
  /** Persist a strategy selection without starting execution. */
  switchStrategy(
    options: SwitchStrategyOptions,
  ): Promise<import("./state/state.types").RunPreparedSnapshot>;
  /** Check context and send a continuation, retaining rejected drafts. */
  sendRun(options: SendRunOptions): Promise<SendRunResult>;
  /** Execute a newly prepared run. */
  startRun(runId: string, input?: string): RunExecutionHandle;
  /** Stop preparation or execution and release resources. */
  stopRun(runId: string): Promise<void>;
  /** Interrupt and steer one active model invocation after persisting the message. */
  steerRun(runId: string, text: string, messageId: string): Promise<void>;
  /** Answer one pending input request by its unique ID. */
  resolveInput(runId: string, inputId: string, text: string): Promise<void>;
  /** Read current state or saved metadata without preparing execution resources or modifying storage. */
  getRun(runId: string): Promise<RunSnapshot | undefined>;
  /** Read this conversation's display history; omit options for all finished entries. */
  getHistory(
    runId: string,
    options?: RunHistoryOptions,
  ): Promise<RunHistoryPage>;
}
