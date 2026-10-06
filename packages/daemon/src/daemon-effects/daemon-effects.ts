import { getLogger } from "@logtape/logtape";
import type { RunTransitionEffect } from "../server/daemon-store";
import type {
  DaemonEffect,
  DaemonEventDispatcher,
  DaemonEventDispatcherConfig,
} from "./daemon-effects.types";

const logger = getLogger(["comma", "daemon", "daemon-effects"]);

/**
 * Create synchronous typed event delivery for internal daemon effects.
 *
 * @param {DaemonEventDispatcherConfig} config - Store observation, initial effects, and failure logging.
 * @returns {DaemonEventDispatcher} An internal dispatcher with deterministic effect ordering.
 * @internal
 *
 * @example
 * ```ts
 * const events = createDaemonEventDispatcher({ daemonStore, effects });
 * events.publish({ type: "client.runtime.connected", clientId });
 * ```
 */
export function createDaemonEventDispatcher({
  effects = [],
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

  return {
    publish,
    subscribe(effect): () => void {
      registeredEffects.add(effect);
      return (): void => {
        registeredEffects.delete(effect);
      };
    },
    dispose(): void {
      registeredEffects.clear();
    },
  };
}

/**
 * Create logging for client connection lifecycle transitions.
 *
 * @returns {DaemonEffect} A client lifecycle effect.
 * @internal
 *
 * @example
 * ```ts
 * const effect = createClientLifecycleEffect();
 * ```
 */
export function createClientLifecycleEffect(): DaemonEffect {
  return {
    name: "client-lifecycle-logging",
    eventTypes: ["client.runtime.connected", "client.runtime.disconnected"],
    handle(event): void {
      if (event.type === "client.runtime.connected") {
        logger.info(`Client connected: ${event.clientId}`);
      } else if (event.type === "client.runtime.disconnected") {
        logger.info(`Client disconnected: ${event.clientId}`);
      }
    },
  };
}

/**
 * Create diagnostic logging for run lifecycle transitions.
 *
 * @returns {RunTransitionEffect} A run lifecycle effect.
 * @internal
 *
 * @example
 * ```ts
 * const effect = createRunLifecycleEffect();
 * ```
 */
export function createRunLifecycleEffect(): RunTransitionEffect {
  return {
    name: "run-lifecycle-logging",
    handle({ run, transition }): void {
      logger.debug(`Daemon run.${transition.type}`, { runId: run.id });
    },
  };
}
