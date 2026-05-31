import type { Logger } from "../../logger/logger.types";
import type { RunStore } from "../../runs/runs.types";
import type { DaemonSystem } from "../systems.types";

export interface PersistenceSystemOptions {
  readonly logger: Logger;
  readonly runStore: RunStore;
}

export interface PersistenceSystem extends DaemonSystem {
  readonly name: "persistence";
}

export function createPersistenceSystem(
  options: PersistenceSystemOptions,
): PersistenceSystem;
