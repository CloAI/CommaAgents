import type { RunRepository } from "../../run-repository";
import type { DaemonSystem } from "../systems.types";

export interface PersistenceSystemOptions {
  readonly runRepository: RunRepository;
}

export interface PersistenceSystem extends DaemonSystem {
  readonly name: "persistence";
}
