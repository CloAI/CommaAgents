import type { GuardCallbacks } from "@comma-agents/core";
import type { DaemonSystem } from "../systems.types";

export type QuestionRequester = NonNullable<GuardCallbacks["onQuestion"]>;

/**
 * System that manages question requests and client responses.
 */
export interface QuestionSystem extends DaemonSystem {
  readonly name: "question";
}
