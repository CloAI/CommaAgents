import { createPlugin } from "../../daemon-plugin";
import { createSandboxContext, getPendingPermissions } from "./state";
import { resolvePermission } from "./permissions";
import {
  prepareSandboxScope,
  updateSandboxPolicy,
  disposeSandbox,
} from "./scopes";
import type {
  CreateSandboxPluginOptions,
  SandboxPlugin,
} from "./sandbox.types";
import type { SandboxNotifications } from "./sandbox.notifications";
import type { SandboxContext } from "./state/state.types";

/**
 * Register sandboxing and permission handling for root and child executions.
 * @param {CreateSandboxPluginOptions} options - Run plugin dependency.
 * @returns {SandboxPlugin} Permission and policy controls with scoped cleanup.
 * @example
 * ```ts
 * const sandbox = createSandboxPlugin({ dependencies: { runs } });
 * await sandbox.notifications.subscribe("run_permission_requested", runId, (request) => {
 *   sandbox.resolvePermission(request.runId, request.requestId, "deny");
 * });
 * ```
 */
export function createSandboxPlugin({
  dependencies,
}: CreateSandboxPluginOptions): SandboxPlugin {
  const { plugin, notifications } = createPlugin<
    "sandbox",
    SandboxNotifications
  >({
    name: "sandbox",
    notifications: true,
    cleanup: async () => disposeSandbox(context),
    notificationHooks: {
      getRecipientKeys: (runId) =>
        dependencies.runs
          .getRunLineage(runId)
          .map((identity) => identity.runId),
      onSubscribe: (type, runId, deliver) => {
        if (type !== "run_permission_requested") {
          return;
        }

        for (const request of getPendingPermissions(context, runId)) {
          if (context.pending.has(request.requestId)) {
            deliver(request);
          }
        }
      },
    },
  });
  const context: SandboxContext = createSandboxContext(
    dependencies.runs,
    notifications,
  );
  dependencies.runs.registerRunPreparation({
    name: "sandbox",
    prepare: (preparation) => prepareSandboxScope(context, preparation),
  });
  return {
    ...plugin,
    resolvePermission: (runId, requestId, decision) =>
      resolvePermission(context, runId, requestId, decision),
    updatePolicy: (runId, patch, toolName) =>
      updateSandboxPolicy(context, runId, patch, toolName),
    getPendingPermissions: (runId) => getPendingPermissions(context, runId),
  };
}
