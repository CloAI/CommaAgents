import type { PermissionDecision } from "@comma-agents/core";
import { createPermissionBridge } from "../../permission-bridge";
import type {
  CleanupContext,
  DaemonSystem,
  SystemRunContext,
} from "../systems.types";
import type { PermissionSystemOptions } from "./permission.types";

/**
 * Creates the permission system that manages permission requests.
 *
 * This system:
 * - Creates and manages the PermissionBridge lifecycle
 * - Stores the permissionBridge in systemData for sandbox callbacks
 * - Registers the resolvePermission action for handling user decisions
 *
 * @param options - Configuration options for the permission system
 * @returns A DaemonSystem that handles permission requests
 */
export function createPermissionSystem(
  options: PermissionSystemOptions = {},
): DaemonSystem {
  const { bridgeTimeout = 0 } = options;

  return {
    name: "permission",

    onRunStart(runContext: SystemRunContext): void {
      const { run, sink, abortSignal, systemData, runActionRegistry } =
        runContext;

      const permissionBridge = createPermissionBridge({
        sink,
        runId: run.id,
        timeout: bridgeTimeout,
        abort: abortSignal,
      });

      systemData.set("permissionBridge", permissionBridge);

      runActionRegistry.register(
        "resolvePermission",
        run.id,
        (permissionRequestId: unknown, decision: unknown): boolean => {
          return permissionBridge.resolvePermission(
            permissionRequestId as string,
            decision as PermissionDecision,
          );
        },
      );
    },

    onRunCleanup(cleanupContext: CleanupContext): void {
      const { run, systemData, runActionRegistry } = cleanupContext;

      const permissionBridge = systemData.get("permissionBridge");

      if (permissionBridge) {
        permissionBridge.destroy();
      }

      runActionRegistry.unregisterAll(run.id);
    },
  };
}
