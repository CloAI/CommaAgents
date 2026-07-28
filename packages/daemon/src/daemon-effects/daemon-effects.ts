import type { Logger } from "../logger/logger.types";
import type {
  DaemonEffect,
  DaemonEventDispatcher,
  DaemonEventDispatcherConfig,
} from "./daemon-effects.types";

/**
 * Create synchronous typed event delivery for internal daemon effects.
 *
 * @param config - Store observation, initial effects, and failure logging.
 * @returns An internal dispatcher with deterministic effect ordering.
 * @internal
 *
 * @example
 * ```ts
 * const events = createDaemonEventDispatcher({ daemonStore, effects, logger });
 * events.publish({ type: "client.runtime.connected", clientId });
 * ```
 */
export function createDaemonEventDispatcher({
  daemonStore,
  effects = [],
  logger,
}: DaemonEventDispatcherConfig): DaemonEventDispatcher {
  const registeredEffects = new Set<DaemonEffect>(effects);

  function publish(
    event: Parameters<DaemonEventDispatcher["publish"]>[0],
  ): void {
    for (const effect of registeredEffects) {
      if (effect.eventTypes && !effect.eventTypes.includes(event.type))
        continue;
      try {
        effect.handle(event);
      } catch (error: unknown) {
        logger.error(`Daemon effect ${effect.name} failed`, {
          eventType: event.type,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
  }

  const unsubscribeFromStore = daemonStore.subscribeToActions(publish);

  return {
    publish,
    subscribe(effect): () => void {
      registeredEffects.add(effect);
      return (): void => {
        registeredEffects.delete(effect);
      };
    },
    dispose(): void {
      unsubscribeFromStore();
      registeredEffects.clear();
    },
  };
}

/**
 * Create logging for client connection lifecycle transitions.
 *
 * @param logger - Destination for connection diagnostics.
 * @returns A client lifecycle effect.
 * @internal
 *
 * @example
 * ```ts
 * const effect = createClientLifecycleEffect(logger);
 * ```
 */
export function createClientLifecycleEffect(logger: Logger): DaemonEffect {
  return {
    name: "client-lifecycle-logging",
    eventTypes: ["client.added", "client.removed"],
    handle(event): void {
      if (event.type === "client.added") {
        logger.info(`Client connected: ${event.clientId}`);
      } else if (event.type === "client.removed") {
        logger.info(`Client disconnected: ${event.clientId}`);
      }
    },
  };
}

/**
 * Create diagnostic logging for run lifecycle transitions.
 *
 * @param logger - Destination for run lifecycle diagnostics.
 * @returns A run lifecycle effect.
 * @internal
 *
 * @example
 * ```ts
 * const effect = createRunLifecycleEffect(logger);
 * ```
 */
export function createRunLifecycleEffect(logger: Logger): DaemonEffect {
  return {
    name: "run-lifecycle-logging",
    eventTypes: [
      "run.created",
      "run.started",
      "run.completed",
      "run.failed",
      "run.cancelled",
      "run.removed",
    ],
    handle(event): void {
      if (!("run" in event)) return;
      logger.debug(`Daemon ${event.type}`, { runId: event.run.id });
    },
  };
}
