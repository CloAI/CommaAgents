import type {
  SandboxNotifications,
  SandboxPermissionRequest,
} from "./sandbox.notifications";
import type {
  PermissionDecision,
  PolicyPatch,
} from "@comma-agents/core/sandbox";
import type { NotifyingPlugin } from "../../daemon-plugin";
import type { RunsPlugin } from "../runs";

/** Dependencies used to register sandbox services with runs. */
export interface CreateSandboxPluginOptions {
  /** Feature services supplied by the daemon. */
  readonly dependencies: {
    /** Run preparation registration API. */
    readonly runs: RunsPlugin;
  };
}

/** Sandboxing, permission decisions, and policy controls for prepared runs. */
export interface SandboxPlugin extends NotifyingPlugin<
  "sandbox",
  SandboxNotifications
> {
  /** Resolve a pending permission belonging to this execution. Returns false for stale requests. */
  resolvePermission(
    runId: string,
    requestId: string,
    decision: PermissionDecision,
  ): boolean;
  /** Update this execution's sandbox. Returns false if its scope has ended. */
  updatePolicy(runId: string, patch: PolicyPatch, toolName?: string): boolean;
  /** Read unresolved requests for this execution and its descendants. */
  getPendingPermissions(runId: string): readonly SandboxPermissionRequest[];
}
