import type { DaemonSystem } from "../systems.types";

export interface SandboxSystem extends DaemonSystem {
  readonly name: "sandbox";
}

export function createSandboxSystem(): SandboxSystem;
