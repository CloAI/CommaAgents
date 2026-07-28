import type { DaemonSystem } from "../systems.types";

export type { QuestionRequester } from "@comma-agents/core";

/**
 * System that manages question requests and client responses.
 */
export interface QuestionSystem extends DaemonSystem {
  readonly name: "question";
}
