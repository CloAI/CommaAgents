import type { Server, ServerWebSocket } from "bun";

import type { EventSink } from "../executor/event-sink";
import { createStrategyExecutor } from "../executor/executor";
import { createRunStore } from "../runs";
import { markStaleRunsAsInterrupted } from "../runs/runs.utils";
import { createDaemonState } from "../state/state";
import { createDispatcher } from "./protocol/dispatcher";
import type { DaemonMessage } from "./protocol/messages";
import type { CreateDaemonOptions, Daemon, WsData } from "./server.types";

/**
 * Create a daemon instance.
 *
 * The daemon owns the DaemonState, EventSink, and StrategyExecutor.
 * Call `start()` to begin listening and `stop()` to shut down.
 *
 * @param options - Configuration for the daemon instance.
 *
 * @example
 * ```ts
 * const daemon = createDaemon({
 *   config: { port: 3000, host: "127.0.0.1", runsDir: "/tmp/runs" },
 *   logger: consoleLogger,
 * });
 * await daemon.start();
 * ```
 */
export function createDaemon(options: CreateDaemonOptions): Daemon {
  const { config, logger, bridgeTimeout = 0, modelOverride } = options;

  const state = createDaemonState();
  const wsMap = new Map<string, ServerWebSocket<WsData>>();
  const startTime = Date.now();
  let server: Server | null = null;
  let boundPort = 0;

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
            logger.debug(
              `Failed to send to client ${clientId}, likely disconnected`,
            );
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

  const runStore = createRunStore({ runsDir: config.runsDir });

  const executor = createStrategyExecutor({
    state,
    sink,
    logger: logger.child("executor"),
    runStore,
    bridgeTimeout,
    modelOverride,
  });

  const dispatch = createDispatcher({
    executor,
    state,
    runStore,
    logger: logger.child("dispatcher"),
  });

  function handleFetch(request: Request, server: Server): Response | undefined {
    const url = new URL(request.url);

    // WebSocket upgrade at /ws
    if (url.pathname === "/ws") {
      const clientId = crypto.randomUUID();
      const upgraded = server.upgrade<WsData>(request, { data: { clientId } });
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

  const daemon: Daemon = {
    async start(): Promise<void> {
      if (server) {
        throw new Error("Daemon is already running");
      }

      // Reconcile stale persisted runs before accepting any clients. Any
      // run on disk still claiming `pending`/`running` is necessarily
      // dead (its in-memory state died with the previous daemon), so we
      // mark it `cancelled` with an `INTERRUPTED` error. This prevents
      // the TUI from subscribing to a run that will never emit events.
      try {
        await markStaleRunsAsInterrupted(runStore, logger);
      } catch (recoveryError) {
        logger.error(
          `Stale-run recovery failed: ${
            recoveryError instanceof Error
              ? recoveryError.message
              : String(recoveryError)
          }`,
        );
      }

      server = Bun.serve<WsData>({
        port: config.port,
        hostname: config.host,

        fetch(request, server) {
          return handleFetch(request, server);
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
            // Verbose visibility into the wire: log every inbound frame
            // (truncated) before any parsing/validation happens. This is the
            // ground truth for "did the client's message actually arrive?"
            const preview =
              typeof raw === "string" ? raw : raw.toString("utf-8");
            const truncated =
              preview.length > 500
                ? `${preview.slice(0, 500)}...[+${preview.length - 500}]`
                : preview;
            logger.debug(
              `ws.message from ${clientId} (${preview.length} bytes): ${truncated}`,
            );
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
