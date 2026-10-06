import type { RunTransitionEffect } from "../../server/daemon-store";
import type { RunRepository } from "../run-repository";
import type { ExecutionContext } from "../systems";

export interface CreateRunPersistenceEffectOptions {
  readonly context: ExecutionContext;
  readonly runRepository: RunRepository;
}

export interface CreateRunProtocolEffectOptions {
  readonly context: ExecutionContext;
}

export type RunLifecycleEffect = RunTransitionEffect;
