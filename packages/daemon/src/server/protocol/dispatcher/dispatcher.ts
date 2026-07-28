import type { DaemonMessage } from "../messages";
import type { CreateDispatcherOptions, Dispatcher } from "./dispatcher.types";

/**
 * Create the daemon's outbound protocol dispatcher.
 *
 * Inbound frames are owned by the daemon service registry. This boundary only
 * knows how to deliver a message to one client or to a run's subscribers.
 *
 * @param options - Dependencies needed for WebSocket message delivery.
 * @returns An outbound daemon message sender.
 * @internal
 *
 * @example
 * ```ts
 * const dispatcher = createDispatcher({ daemonStore, clients, logger });
 * dispatcher.send(clientId, { type: "pong", ts: new Date().toISOString() });
 * ```
 */
export function createDispatcher({
  daemonStore,
  clients,
  logger,
}: CreateDispatcherOptions): Dispatcher {
  function send(clientId: string, message: DaemonMessage): void {
    const websocket = clients.get(clientId);
    if (!websocket) {
      logger.debug(`send: client ${clientId} not found`);
      return;
    }

    try {
      websocket.send(JSON.stringify(message));
    } catch {
      logger.debug(`Failed to send to client ${clientId}`);
    }
  }

  function broadcast(runId: string, message: DaemonMessage): void {
    const serializedMessage = JSON.stringify(message);
    for (const clientId of daemonStore.getSubscribers(runId)) {
      const websocket = clients.get(clientId);
      if (!websocket) continue;

      try {
        websocket.send(serializedMessage);
      } catch {
        logger.debug(
          `Failed to send to client ${clientId}, likely disconnected`,
        );
      }
    }
  }

  return { send, broadcast };
}

export type { CreateDispatcherOptions } from "./dispatcher.types";
