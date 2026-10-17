import type { AgentCallResult } from "@comma-agents/core";

export type RunLifecycleStatus =
  | "pending"
  | "running"
  | "completed"
  | "error"
  | "cancelled";

export interface RunError {
  readonly code: string;
  readonly message: string;
}

interface RunMetadata {
  readonly id: string;
  readonly strategyPath: string;
  readonly strategyName: string;
  readonly startedAt: Date;
  readonly cwd: string;
}

export type RunSnapshot = RunMetadata &
  (
    | {
        readonly status: "pending" | "running";
        readonly completedAt?: undefined;
        readonly result?: undefined;
        readonly error?: undefined;
      }
    | {
        readonly status: "completed";
        readonly completedAt: Date;
        readonly result: AgentCallResult;
        readonly error?: undefined;
      }
    | {
        readonly status: "error" | "cancelled";
        readonly completedAt: Date;
        readonly result?: undefined;
        readonly error: RunError;
      }
  );

export type RunTransition =
  | { readonly type: "running" }
  | { readonly type: "completed"; readonly result: AgentCallResult }
  | { readonly type: "error"; readonly error: RunError }
  | { readonly type: "cancelled"; readonly error: RunError };

export interface RunTransitionEvent {
  readonly previousRun: RunSnapshot;
  readonly run: RunSnapshot;
  readonly transition: RunTransition;
}

export interface RunTransitionEffect {
  readonly name: string;
  readonly statuses?: readonly RunLifecycleStatus[];
  handle(event: RunTransitionEvent): Promise<void> | void;
}

export interface RunTransitionEffectError {
  readonly effectName: string;
  readonly error: unknown;
}

export interface RunTransitionResult {
  readonly run: RunSnapshot;
  readonly effectErrors: readonly RunTransitionEffectError[];
}

export interface CreateRunStoreOptions {
  readonly id?: string;
  readonly strategyPath: string;
  readonly strategyName: string;
  readonly cwd: string;

  readonly restoredRun?: RunSnapshot;
}

export interface RunStore {
  readonly id: string;
  readonly abortSignal: AbortSignal;
  snapshot(): RunSnapshot;
  transition(transition: RunTransition): Promise<RunTransitionResult>;
  subscribeToTransitions(effect: RunTransitionEffect): () => void;
  addSubscriber(clientId: string): void;
  removeSubscriber(clientId: string): void;
  getSubscribers(): readonly string[];
  setRuntimeValue<ValueType>(key: string, value: ValueType): void;
  getRuntimeValue<ValueType>(key: string): ValueType | undefined;
  deleteRuntimeValue(key: string): void;
  registerAction<ArgumentTypes extends unknown[]>(
    actionName: string,
    handler: (...actionArguments: ArgumentTypes) => boolean,
  ): void;
  invokeAction<ArgumentTypes extends unknown[]>(
    actionName: string,
    ...actionArguments: ArgumentTypes
  ): boolean;
  clearActions(): void;
  dispose(): void;
}
