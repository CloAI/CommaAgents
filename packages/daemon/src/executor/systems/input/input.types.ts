import type { DaemonSystem } from "../systems.types";

/**
 * Options for creating the input system.
 */
export interface InputSystemOptions {
  /**
   * Timeout in milliseconds for input requests.
   * 0 means no timeout.
   * @default 0
   */
  readonly bridgeTimeout?: number;
}

/**
 * System that manages user input collection via InputBridge.
 */
export interface InputSystem extends DaemonSystem {
  readonly name: "input";
}
