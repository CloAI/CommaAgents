import type {
  AgentCallResult,
  ConversationHistory,
  InputCollector,
  LaunchStrategyHandle,
  LoadedStrategy,
  PermissionDecision,
  PermissionRequester,
  PolicyPatch,
  Sandbox,
  SkillRegistry,
} from "@comma-agents/core";
import type { LanguageService } from "../../language";
import type { Logger } from "../../logger/logger.types";
import type { DaemonState, RunState } from "../../state/state.types";
import type { EventSink } from "../event-sink";
import type { RunStore } from "../run-store";
import type { QuestionRequester } from "./question/question.types";

export interface CreateRunSystemOptions {
  readonly state: DaemonState;
  readonly sink: EventSink;
  readonly logger: Logger;
  readonly runsDir: string;
  readonly modelOverride?: string;
}

export interface RunSystem {
  readonly runStore: RunStore;
  readonly actions: RunActionRegistry;

  prepareRun(
    clientId: string,
    options: PrepareRunOptions,
  ): Promise<PreparedRunMetadata>;

  startRun(
    clientId: string,
    runId: string,
    input?: string,
    requestId?: string,
  ): void;

  continueRun(
    clientId: string,
    runId: string,
    input: string,
    requestId?: string,
  ): void;

  stopRun(runId: string): void;
  shutdown(): Promise<void>;
}

export interface PrepareRunOptions {
  readonly runId?: string;
  readonly strategyPath?: string;
  readonly modelOverride?: string;
  readonly cwd?: string;
  readonly manifestPath?: string;
}

/** A genuine human input (a run start or continuation prompt) for rehydration. */
export interface RehydratedConversationInput {
  /** The human-entered text that kicked off this run segment. */
  readonly text: string;
  /**
   * Id of the first agent_call record produced after this input. The renderer
   * places the human bubble immediately before that record. Undefined when the
   * segment produced no agent calls (e.g. prepared-but-not-executed), in which
   * case the input renders at the end.
   */
  readonly beforeRecordId?: string;
}

/**
 * Conversation history extended with the genuine human inputs, so rehydration
 * can distinguish a human prompt from an inter-agent handoff.
 */
export interface RehydratedConversation extends ConversationHistory {
  readonly inputs: readonly RehydratedConversationInput[];
}

export interface PreparedRunMetadata {
  readonly runId: string;
  readonly strategyName: string;
  readonly agents: string[];
  readonly flowTree: Record<string, unknown>;
  readonly conversation: RehydratedConversation;
}

export interface SystemDataMap {
  inputCollector: InputCollector;
  permissionRequester: PermissionRequester;
  questionRequester: QuestionRequester;
  sandbox: Sandbox;
  steeringMailbox: string[];
  launchStrategy: LaunchStrategyHandle;
  skillRegistry: SkillRegistry;
  languageService: LanguageService;
  lastAgentOutputText: string | null;
}

export interface SystemDataStore {
  set<Key extends keyof SystemDataMap>(
    key: Key,
    value: SystemDataMap[Key],
  ): void;
  get<Key extends keyof SystemDataMap>(
    key: Key,
  ): SystemDataMap[Key] | undefined;
}

export interface RunActionArgsMap {
  steer: [text: string];
  resolveInput: [agentName: string, text: string];
  resolvePermission: [
    permissionRequestId: string,
    decision: PermissionDecision,
  ];
  resolveQuestion: [questionRequestId: string, response: string];
  updatePolicy: [patch: PolicyPatch, toolName?: string];
}

export type RunActionHandler<ActionName extends keyof RunActionArgsMap> = (
  ...args: RunActionArgsMap[ActionName]
) => boolean;

export interface RunActionRegistry {
  register<ActionName extends keyof RunActionArgsMap>(
    actionName: ActionName,
    runId: string,
    handler: RunActionHandler<ActionName>,
  ): void;
  invoke<ActionName extends keyof RunActionArgsMap>(
    actionName: ActionName,
    runId: string,
    ...args: RunActionArgsMap[ActionName]
  ): boolean;
  unregisterAll(runId: string): void;
}

export interface SystemRunContext {
  readonly run: RunState;
  readonly sink: EventSink;
  readonly logger: Logger;
  readonly clientId: string;
  readonly modelOverride: string | undefined;
  readonly abortSignal: AbortSignal;
  readonly systemData: SystemDataStore;
  readonly actions: RunActionRegistry;
  readonly strategyPath: string;
  readonly cwd: string;
  readonly manifestPath: string | undefined;
}

export interface StrategyLoadedContext extends SystemRunContext {
  readonly strategy: LoadedStrategy;
}

export interface ExecutionContext extends StrategyLoadedContext {
  readonly input: string;
  readonly requestId: string | undefined;
}

export interface CompletionContext extends ExecutionContext {
  readonly result: AgentCallResult;
}

export interface ErrorContext extends ExecutionContext {
  readonly error: Error;
  readonly classified: {
    status: "error" | "cancelled";
    code: string;
    message: string;
  };
}

export interface CleanupContext extends SystemRunContext {}

export interface DaemonSystem {
  readonly name: string;
  onRunPrepare?(runContext: SystemRunContext): Promise<void> | void;
  onStrategyLoaded?(
    strategyContext: StrategyLoadedContext,
  ): Promise<void> | void;
  onBeforeExecute?(executionContext: ExecutionContext): Promise<void> | void;
  onRunComplete?(completionContext: CompletionContext): Promise<void> | void;
  onRunError?(errorContext: ErrorContext): Promise<void> | void;
  onRunCleanup?(cleanupContext: CleanupContext): Promise<void> | void;
}
