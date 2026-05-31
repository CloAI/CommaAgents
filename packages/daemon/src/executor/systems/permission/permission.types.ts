import type { DaemonSystem } from "../systems.types";

/**
 * Options for creating the permission system.
 */
export interface PermissionSystemOptions {
  /**
   * Timeout in milliseconds for permission requests.
   * 0 means no timeout.
   * @default 0
   */
  readonly bridgeTimeout?: number;
}

/**
 * System that manages permission requests via PermissionBridge.
 */
export interface PermissionSystem extends DaemonSystem {
  readonly name: "permission";
}
