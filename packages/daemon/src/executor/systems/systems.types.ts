import type {
  AgentCallResult,
  InputCollector,
  LaunchStrategyHandle,
  LoadedStrategy,
  Sandbox,
  SkillRegistry,
} from "@comma-agents/core";
import type { LanguageService } from "../../language";
import type { Logger } from "../../logger/logger.types";
import type { RunStore } from "../../runs/runs.types";
import type { RunState } from "../../state/state.types";
import type { EventSink } from "../event-sink";
import type { InputBridge } from "../input-bridge";
import type { PermissionBridge } from "../permission-bridge";
import type { QuestionBridge } from "../question-bridge";

export interface SystemDataMap {
  inputCollector: InputCollector;
  inputBridge: InputBridge;
  permissionBridge: PermissionBridge;
  questionBridge: QuestionBridge;
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

export interface RunActionRegistry {
  register(
    actionName: string,
    runId: string,
    handler: (...args: unknown[]) => boolean,
  ): void;
  invoke(actionName: string, runId: string, ...args: unknown[]): boolean;
  unregisterAll(runId: string): void;
}

export interface SystemRunContext {
  readonly run: RunState;
  readonly sink: EventSink;
  readonly runStore: RunStore;
  readonly logger: Logger;
  readonly clientId: string;
  readonly requestId: string | undefined;
  readonly modelOverride: string | undefined;
  readonly abortSignal: AbortSignal;
  readonly systemData: SystemDataStore;
  readonly runActionRegistry: RunActionRegistry;
  readonly strategyPath: string;
  readonly input: string;
  readonly cwd: string;
  readonly manifestPath: string | undefined;
  readonly previousRunId: string | undefined;
}

export interface StrategyLoadedContext extends SystemRunContext {
  readonly strategy: LoadedStrategy;
  readonly input: string;
  readonly cwd: string;
}

export interface ExecutionContext extends StrategyLoadedContext {}

export interface CompletionContext extends SystemRunContext {
  readonly result: AgentCallResult;
}

export interface ErrorContext extends SystemRunContext {
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
  onRunStart?(runContext: SystemRunContext): Promise<void> | void;
  onStrategyLoaded?(
    strategyContext: StrategyLoadedContext,
  ): Promise<void> | void;
  onBeforeExecute?(executionContext: ExecutionContext): Promise<void> | void;
  onRunComplete?(completionContext: CompletionContext): Promise<void> | void;
  onRunError?(errorContext: ErrorContext): Promise<void> | void;
  onRunCleanup?(cleanupContext: CleanupContext): Promise<void> | void;
}
