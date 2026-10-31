import type { RunContent, RunMessage, ChildRunEntry } from "./messages";
import type { RunError, RunSnapshot } from "./runs.types";

/** Watcher event for snapshot. */
export interface RunSnapshotStatus {
  /** Event discriminator. */
  readonly type: "run_snapshot" /** Current run snapshot. */;
  readonly snapshot: RunSnapshot;
}

/** Unexpected asynchronous operation failure. */
export interface RunErrorStatus {
  readonly type: "run_error";
  readonly runId: string;
  readonly error: RunError;
}

/** Watcher event for input request. */
export interface RunInputRequestStatus {
  /** Event discriminator. */
  readonly type: "run_input_requested";
  /** Stable run identifier. */
  readonly runId: string;
  /** Unique pending input request identifier. */
  readonly inputId: string;
  /** Immediate parent execution, when applicable. */
  readonly parentRunId?: string;
  /** Agent that emitted or requested this event. */
  readonly agentName: string;
  /** Question presented to the user. */
  readonly prompt: string;
}

/** Watcher event for step. */
export interface RunStepStatus {
  /** Event discriminator. */
  readonly type: "run_step";
  /** Stable run identifier. */
  readonly runId: string;
  /** Immediate parent execution, when applicable. */
  readonly parentRunId?: string;
  /** Whether the step started or completed. */
  readonly phase: "started" | "completed";
  /** Step that changed phase. */
  readonly stepName: string;
}

/** Watcher event for steer queued. */
export interface RunSteerQueuedStatus {
  /** Event discriminator. */
  readonly type: "run_steer_queued";
  /** Stable run identifier. */
  readonly runId: string;
  /** Queued steering text. */
  readonly text: string;
}

/** Status and live output delivered to a run watcher. */
export interface RunMessageStreamStatus {
  readonly type: "run_message_stream";
  readonly runId: string;
  readonly messageId: string;
  readonly agentName: string;
  readonly createdAt: string;
  readonly model?: string;
  readonly contextWindow?: number;
  readonly contentIndex: number;
  readonly content: RunContent;
}
/** A model invocation available as a steering recipient. */
export interface RunAgentStartedStatus {
  readonly type: "run_agent_started";
  readonly runId: string;
  readonly messageId: string;
  readonly agentName: string;
  readonly createdAt: string;
}
export interface RunMessageOutputStatus {
  readonly type: "run_message_output";
  readonly runId: string;
  readonly message: RunMessage;
}
export interface RunChildStatus {
  readonly type: "run_child";
  readonly runId: string;
  readonly entry: ChildRunEntry;
}
export interface RunInputResolvedStatus {
  readonly type: "run_input_resolved";
  readonly runId: string;
  readonly inputId: string;
}

export type RunStatus =
  | RunAgentStartedStatus
  | RunMessageStreamStatus
  | RunMessageOutputStatus
  | RunChildStatus
  | RunInputResolvedStatus
  | RunSnapshotStatus
  | RunErrorStatus
  | RunInputRequestStatus
  | RunStepStatus
  | RunSteerQueuedStatus;

/** Declared run notification collection, indexed by event discriminator. */
export type RunNotifications = {
  [Notification in RunStatus as Notification["type"]]: Notification;
};
