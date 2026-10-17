import type {
  PermissionRequest,
  GuardPolicySnapshot,
} from "@comma-agents/core/sandbox";

/** Permission awaiting a decision in a root or child execution. */
export interface SandboxPermissionRequest extends Omit<
  PermissionRequest,
  "signal"
> {
  /** Notification discriminator. */
  readonly type: "run_permission_requested";
  /** Identifier of the requesting execution. */
  readonly runId: string;
  /** Immediate parent execution, when applicable. */
  readonly parentRunId?: string;
  /** Unique identifier used to resolve this request. */
  readonly requestId: string;
  /** Time at which approval was requested. */
  readonly ts: string;
}

/** A tool guard's updated policies within one execution scope. */
export interface SandboxPolicyUpdate {
  /** Notification discriminator. */
  readonly type: "run_policy_updated";
  /** Identifier of the requesting execution. */
  readonly runId: string;
  /** Immediate parent execution, when applicable. */
  readonly parentRunId?: string;
  /** Tool whose guard changed. */
  readonly tool: string;
  /** Current policy descriptions for the tool. */
  readonly policies: GuardPolicySnapshot["policies"];
  /** Time at which policies changed. */
  readonly ts: string;
}

/** Live notifications owned by the sandbox feature. */
export type SandboxStatus = SandboxPermissionRequest | SandboxPolicyUpdate;

/** Declared sandbox notification collection, indexed by event discriminator. */
export type SandboxNotifications = {
  [Notification in SandboxStatus as Notification["type"]]: Notification;
};
