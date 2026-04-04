// WebSocket server — the daemon's network layer.
//
// `createDaemon()` builds a Bun-native HTTP + WebSocket server that:
//   1. Accepts client connections at `/ws` (WebSocket upgrade)
//   2. Exposes a health check at `/health`
//   3. Delegates all message handling to the dispatcher
//   4. Implements EventSink so the executor can broadcast events
//   5. Manages client lifecycle (connect/disconnect → state tracking)
//
// The daemon internally constructs the DaemonState, EventSink, and
// StrategyExecutor so there are no circular dependency issues.

import type { Server, ServerWebSocket } from "bun";

import type { EventSink } from "../executor/event-sink";
import { createStrategyExecutor } from "../executor/executor";
import { createDaemonState } from "../state/state";
import { createDispatcher } from "./protocol/dispatcher";
import type { DaemonMessage } from "./protocol/messages";
import type { CreateDaemonOptions, Daemon, WsData } from "./server.types";

// createDaemon()

/**
 * Create a daemon instance.
 *
 * The daemon owns the DaemonState, EventSink, and StrategyExecutor.
 * Call `start()` to begin listening and `stop()` to shut down.
 */
export function createDaemon(options: CreateDaemonOptions): Daemon {
  const { config, logger, bridgeTimeout = 0, modelOverride } = options;

  // -- Internal state --

  const state = createDaemonState();
  const wsMap = new Map<string, ServerWebSocket<WsData>>();
  const startTime = Date.now();
  let server: Server | null = null;
  let boundPort = 0;

  // -- EventSink implementation --

  const sink: EventSink = {
    broadcast(runId: string, message: DaemonMessage): void {
      const subscribers = state.getSubscribers(runId);
      const json = JSON.stringify(message);
      for (const clientId of subscribers) {
        const websocket = wsMap.get(clientId);
        if (websocket) {
          try {
            websocket.send(json);
          } catch {
            // Client may have disconnected between getSubscribers and send.
            // The close handler will clean up.
            logger.debug(`Failed to send to client ${clientId}, likely disconnected`);
          }
        }
      }
    },

    send(clientId: string, message: DaemonMessage): void {
      const websocket = wsMap.get(clientId);
      if (!websocket) {
        logger.debug(`send: client ${clientId} not found in wsMap`);
        return;
      }
      try {
        websocket.send(JSON.stringify(message));
      } catch {
        logger.debug(`Failed to send to client ${clientId}`);
      }
    },
  };

  // -- Strategy executor --

  const executor = createStrategyExecutor({
    state,
    sink,
    logger: logger.child("executor"),
    bridgeTimeout,
    modelOverride,
  });

  // -- Message dispatcher --

  const dispatch = createDispatcher({
    executor,
    state,
    logger: logger.child("dispatcher"),
  });

  // -- HTTP fetch handler --

  function handleFetch(request: Request, srv: Server): Response | undefined {
    const url = new URL(request.url);

    // WebSocket upgrade at /ws
    if (url.pathname === "/ws") {
      const clientId = crypto.randomUUID();
      const upgraded = srv.upgrade<WsData>(request, { data: { clientId } });
      if (!upgraded) {
        return new Response("WebSocket upgrade failed", { status: 400 });
      }
      // Bun returns undefined on successful upgrade
      return undefined;
    }

    // Health check at /health
    if (url.pathname === "/health" && request.method === "GET") {
      const runs = state.listRuns();
      const activeRuns = runs.filter(
        (run) => run.status === "pending" || run.status === "running",
      ).length;
      const body = {
        status: "ok",
        uptime: Date.now() - startTime,
        activeRuns,
        connectedClients: state.getClients().length,
      };
      return new Response(JSON.stringify(body), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Everything else → 404
    return new Response("Not Found", { status: 404 });
  }

  // -- Daemon public API --

  const daemon: Daemon = {
    async start(): Promise<void> {
      if (server) {
        throw new Error("Daemon is already running");
      }

      server = Bun.serve<WsData>({
        port: config.port,
        hostname: config.host,

        fetch(request, srv) {
          return handleFetch(request, srv);
        },

        websocket: {
          open(websocket) {
            const { clientId } = websocket.data;
            state.addClient(clientId);
            wsMap.set(clientId, websocket);
            logger.info(`Client connected: ${clientId}`);
          },

          message(websocket, raw) {
            const { clientId } = websocket.data;
            dispatch(clientId, raw, (message) => {
              try {
                websocket.send(JSON.stringify(message));
              } catch {
                logger.debug(`Failed to reply to client ${clientId}`);
              }
            });
          },

          close(websocket) {
            const { clientId } = websocket.data;
            state.removeClient(clientId);
            wsMap.delete(clientId);
            logger.info(`Client disconnected: ${clientId}`);
          },
        },
      });

      boundPort = server.port;
      logger.info(`Daemon listening on ${config.host}:${boundPort}`);
    },

    async stop(): Promise<void> {
      if (!server) return;

      // Close all WebSocket connections
      for (const [clientId, websocket] of wsMap) {
        try {
          websocket.close(1001, "Server shutting down");
        } catch {
          // Already closed
        }
        state.removeClient(clientId);
      }
      wsMap.clear();

      // Stop the HTTP server
      server.stop(true);
      server = null;
      boundPort = 0;

      logger.info("Daemon stopped");
    },

    get port(): number {
      return boundPort;
    },

    get url(): string {
      return `ws://${config.host}:${boundPort}/ws`;
    },
  };

  return daemon;
}
