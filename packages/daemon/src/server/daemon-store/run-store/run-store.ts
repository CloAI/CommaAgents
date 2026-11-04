import { getLogger } from "@logtape/logtape";
import { ALLOWED_RUN_STATUS_TRANSITIONS } from "./run-store.constants";
import type {
  CreateRunStoreOptions,
  RunSnapshot,
  RunStore,
  RunTransition,
  RunTransitionEffect,
  RunTransitionEffectError,
} from "./run-store.types";
import { copyRunSnapshot } from "./run-store.utils";

const logger = getLogger(["comma", "daemon", "run-store"]);

/**
 * Create the authoritative in-memory state and runtime resources for one run.
 *
 * @param {CreateRunStoreOptions} options - Run metadata, logging, and optional restored state.
 * @returns {RunStore} The authoritative store and runtime resources for the run.
 * @example
 * ```ts
 * const runStore = createRunStore({
 *   strategyPath: "./strategy.ts",
 *   strategyName: "strategy",
 *   cwd: process.cwd(),
 * });
 * await runStore.transition({ type: "running" });
 * ```
 */
export function createRunStore({
  id,
  strategyPath,
  strategyName,
  cwd,
  restoredRun,
}: CreateRunStoreOptions): RunStore {
  let runState: RunSnapshot = restoredRun
    ? copyRunSnapshot(restoredRun)
    : {
        id: id ?? crypto.randomUUID(),
        strategyPath,
        strategyName,
        startedAt: new Date(),
        cwd,
        status: "pending",
      };
  const abortController = new AbortController();
  const subscribers = new Set<string>();
  const transitionEffects = new Set<RunTransitionEffect>();
  const runtimeValues = new Map<string, unknown>();
  const actionHandlers = new Map<
    string,
    (...actionArguments: never[]) => boolean
  >();
  let disposed = false;

  function assertAvailable(): void {
    if (disposed) {
      throw new Error(`Run store disposed: ${runState.id}`);
    }
  }

  async function transition(
    runTransition: RunTransition,
  ): ReturnType<RunStore["transition"]> {
    assertAvailable();
    if (
      !ALLOWED_RUN_STATUS_TRANSITIONS[runState.status].has(runTransition.type)
    ) {
      throw new Error(
        `Invalid run status transition: ${runState.status} -> ${runTransition.type}`,
      );
    }

    const previousRun = copyRunSnapshot(runState);
    const runMetadata = {
      id: runState.id,
      strategyPath: runState.strategyPath,
      strategyName: runState.strategyName,
      startedAt: runState.startedAt,
      cwd: runState.cwd,
    };
    if (runTransition.type === "running") {
      runState = { ...runMetadata, status: "running" };
    } else if (runTransition.type === "completed") {
      runState = {
        ...runMetadata,
        status: "completed",
        completedAt: new Date(),
        result: runTransition.result,
      };
    } else {
      if (runTransition.type === "cancelled") {
        abortController.abort();
      }
      runState = {
        ...runMetadata,
        status: runTransition.type,
        completedAt: new Date(),
        error: runTransition.error,
      };
    }

    const currentRun = copyRunSnapshot(runState);
    const matchingEffects = [...transitionEffects].filter(
      (effect) =>
        !effect.statuses || effect.statuses.includes(runTransition.type),
    );
    const settledEffects = await Promise.allSettled(
      matchingEffects.map((effect) =>
        Promise.resolve().then(() =>
          effect.handle({
            previousRun,
            run: currentRun,
            transition: runTransition,
          }),
        ),
      ),
    );
    const effectErrors: RunTransitionEffectError[] = [];
    settledEffects.forEach((settledEffect, effectIndex) => {
      if (settledEffect.status === "fulfilled") {
        return;
      }
      const effect = matchingEffects[effectIndex];
      if (!effect) {
        return;
      }
      effectErrors.push({
        effectName: effect.name,
        error: settledEffect.reason,
      });
      logger.error(`Run transition effect ${effect.name} failed`, {
        runId: runState.id,
        status: runTransition.type,
        error:
          settledEffect.reason instanceof Error
            ? settledEffect.reason.message
            : String(settledEffect.reason),
      });
    });

    return { run: currentRun, effectErrors };
  }

  return {
    get id(): string {
      return runState.id;
    },
    get abortSignal(): AbortSignal {
      return abortController.signal;
    },
    snapshot(): RunSnapshot {
      assertAvailable();
      return copyRunSnapshot(runState);
    },
    transition,
    subscribeToTransitions(effect): () => void {
      assertAvailable();
      transitionEffects.add(effect);
      return (): void => {
        transitionEffects.delete(effect);
      };
    },
    addSubscriber(clientId): void {
      assertAvailable();
      subscribers.add(clientId);
    },
    removeSubscriber(clientId): void {
      if (disposed) {
        return;
      }
      subscribers.delete(clientId);
    },
    getSubscribers(): readonly string[] {
      if (disposed) {
        return [];
      }
      return [...subscribers];
    },
    setRuntimeValue<ValueType>(key: string, value: ValueType): void {
      assertAvailable();
      runtimeValues.set(key, value);
    },
    getRuntimeValue<ValueType>(key: string): ValueType | undefined {
      assertAvailable();
      return runtimeValues.get(key) as ValueType | undefined;
    },
    deleteRuntimeValue(key): void {
      if (disposed) {
        return;
      }
      runtimeValues.delete(key);
    },
    registerAction<ArgumentTypes extends unknown[]>(
      actionName: string,
      handler: (...actionArguments: ArgumentTypes) => boolean,
    ): void {
      assertAvailable();
      actionHandlers.set(
        actionName,
        handler as unknown as (...actionArguments: never[]) => boolean,
      );
    },
    invokeAction<ArgumentTypes extends unknown[]>(
      actionName: string,
      ...actionArguments: ArgumentTypes
    ): boolean {
      assertAvailable();
      const actionHandler = actionHandlers.get(actionName);
      if (!actionHandler) {
        return false;
      }
      return (
        actionHandler as unknown as (
          ...actionArguments: ArgumentTypes
        ) => boolean
      )(...actionArguments);
    },
    clearActions(): void {
      if (disposed) {
        return;
      }
      actionHandlers.clear();
    },
    dispose(): void {
      if (disposed) {
        return;
      }
      disposed = true;
      abortController.abort();
      subscribers.clear();
      transitionEffects.clear();
      runtimeValues.clear();
      actionHandlers.clear();
    },
  };
}
