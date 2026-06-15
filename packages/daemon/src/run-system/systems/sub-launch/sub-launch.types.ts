import type { DaemonSystem } from "../systems.types";

export interface SubLaunchSystem extends DaemonSystem {
  readonly name: "sub-launch";
}

export function createSubLaunchSystem(): SubLaunchSystem;
