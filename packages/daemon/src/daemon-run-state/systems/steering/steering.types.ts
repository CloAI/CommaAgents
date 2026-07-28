import type { DaemonSystem } from "../systems.types";

export interface SteeringSystem extends DaemonSystem {
  readonly name: "steering";
}
