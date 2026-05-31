import type { DaemonSystem } from "../systems.types";

/**
 * Options for creating the question system.
 */
export interface QuestionSystemOptions {
  /**
   * Timeout in milliseconds for question requests.
   * 0 means no timeout.
   * @default 0
   */
  readonly bridgeTimeout?: number;
}

/**
 * System that manages question requests via QuestionBridge.
 */
export interface QuestionSystem extends DaemonSystem {
  readonly name: "question";
}
