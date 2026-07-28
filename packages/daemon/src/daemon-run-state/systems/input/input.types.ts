import type { DaemonSystem } from "../systems.types";

/** System that manages user input collection. */
export interface InputSystem extends DaemonSystem {
  readonly name: "input";
}
