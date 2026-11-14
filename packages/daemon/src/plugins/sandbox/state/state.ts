import type { SandboxPermissionRequest } from "../sandbox.notifications";
import type { PluginNotifications } from "../../../daemon-plugin";
import type { SandboxNotifications } from "../sandbox.notifications";
import type { SandboxContext } from "./state.types";
import type { RunsPlugin } from "../../runs";

/**
 * Allocate the sandbox plugin's private state.
 * @param {RunsPlugin} runs - Execution ancestry lookup service.
 * @param {PluginNotifications<SandboxNotifications>} notifications - Private publishing controller.
 * @returns {SandboxContext} Private scopes, requests, and publishing resources.
 * @internal
 */
export function createSandboxContext(
  runs: RunsPlugin,
  notifications: PluginNotifications<SandboxNotifications>,
): SandboxContext {
  return {
    runs,
    scopes: new Map(),
    pending: new Map(),
    notifications,
    disposed: false,
  };
}

/**
 * Read pending permissions without exposing internal request resources.
 * @param {SandboxContext} context - Private feature state.
 * @param {string} runId - Root run identifier.
 * @returns {readonly SandboxPermissionRequest[]} Outstanding approval requests.
 * @internal
 */
export function getPendingPermissions(
  context: SandboxContext,
  runId: string,
): readonly SandboxPermissionRequest[] {
  return [...context.pending.values()]
    .filter((pending) =>
      context.runs
        .getRunLineage(pending.request.runId)
        .some((identity) => identity.runId === runId),
    )
    .map((pending) => pending.request);
}
