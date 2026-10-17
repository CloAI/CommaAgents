import type { AgentCallResult, AgentStreamEvent } from "@comma-agents/core";
import type { RunError, RunSnapshot } from "./runs.types";

/** Watcher event for snapshot. */
export interface RunSnapshotStatus {
  /** Event discriminator. */
  readonly type: "run_snapshot" /** Current run snapshot. */;
  readonly snapshot: RunSnapshot;
}

/** Watcher event for preparation cancelled. */
export interface RunPreparationCancelledStatus {
  readonly type: "run_preparation_cancelled" /** Stable run identifier. */;
  readonly runId: string;
}

/** Watcher event for preparation failed. */
export interface RunPreparationFailedStatus {
  readonly type: "run_preparation_failed";
  /** Stable run identifier. */
  readonly runId: string;
  /** Failure details. */
  readonly error: RunError;
}

/** Watcher event for input request. */
export interface RunInputRequestStatus {
  /** Event discriminator. */
  readonly type: "run_input_requested";
  /** Stable run identifier. */
  readonly runId: string;
  /** Unique pending input request identifier. */
  readonly requestId: string;
  /** Immediate parent execution, when applicable. */
  readonly parentRunId?: string;
  /** Agent that emitted or requested this event. */
  readonly agentName: string;
  /** Question presented to the user. */
  readonly prompt: string;
}

/** Watcher event for agent stream. */
export interface RunAgentStreamStatus {
  /** Event discriminator. */
  readonly type: "run_agent_stream";
  /** Stable run identifier. */
  readonly runId: string;
  /** Immediate parent execution, when applicable. */
  readonly parentRunId?: string;
  /** Agent that emitted or requested this event. */
  readonly agentName: string;
  /** Live agent stream event. */
  readonly event: AgentStreamEvent;
}

/** Watcher event for agent output. */
export interface RunAgentOutputStatus {
  /** Event discriminator. */
  readonly type: "run_agent_output";
  /** Stable run identifier. */
  readonly runId: string;
  /** Immediate parent execution, when applicable. */
  readonly parentRunId?: string;
  /** Agent that emitted or requested this event. */
  readonly agentName: string;
  /** Completed agent result. */
  readonly result: AgentCallResult;
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
export type RunStatus =
  | RunSnapshotStatus
  | RunPreparationCancelledStatus
  | RunPreparationFailedStatus
  | RunInputRequestStatus
  | RunAgentStreamStatus
  | RunAgentOutputStatus
  | RunStepStatus
  | RunSteerQueuedStatus;

/** Declared run notification collection, indexed by event discriminator. */
export type RunNotifications = {
  [Notification in RunStatus as Notification["type"]]: Notification;
};
