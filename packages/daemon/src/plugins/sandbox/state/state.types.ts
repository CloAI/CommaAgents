import type { PluginNotifications } from "../../../daemon-plugin";
import type { PermissionDecision, Sandbox } from "@comma-agents/core/sandbox";
import type {
  SandboxPermissionRequest,
  SandboxNotifications,
} from "../sandbox.notifications";
import type { RunsPlugin } from "../../runs";

/** @internal Resources belonging to one prepared root or child execution. */
export interface SandboxScope {
  readonly runId: string;
  readonly parentRunId?: string;
  readonly sandbox: Sandbox;
  readonly signal: AbortSignal;
  readonly detachAbort: () => void;
  readonly onAbort: () => void;
  disposed: boolean;
}

/** @internal Pending decision and its abort-listener cleanup. */
export interface PendingPermission {
  readonly sandboxScope: SandboxScope;
  readonly request: SandboxPermissionRequest;
  readonly resolve: (decision: PermissionDecision) => void;
  readonly reject: (reason: unknown) => void;
  readonly detachAbort: () => void;
}

/** @internal Mutable resources owned exclusively by the sandbox plugin. */
export interface SandboxContext {
  readonly runs: Pick<RunsPlugin, "getRunLineage">;
  readonly scopes: Map<string, SandboxScope>;
  readonly pending: Map<string, PendingPermission>;
  readonly notifications: PluginNotifications<SandboxNotifications>;
  disposed: boolean;
}
