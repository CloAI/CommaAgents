import type { DaemonSystem } from "../systems.types";

/** System that manages permission requests. */
export interface PermissionSystem extends DaemonSystem {
  readonly name: "permission";
}
