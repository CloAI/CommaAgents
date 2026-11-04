import { getLogger } from "@logtape/logtape";
import { loadCatalog } from "@comma-agents/core";
import { createHubManager } from "@comma-agents/core/hub";
import type { Server, ServerWebSocket } from "bun";
import { createDaemonRunState } from "../daemon-run-state/daemon-run-state";
import {
  createCoreService,
  createDaemonServiceRegistry,
  createHistoryService,
  createHubService,
  createMcpService,
  createRunService,
  createSubscriptionService,
} from "./daemon-services";
import { createDaemonStore } from "./daemon-store/daemon-store";
import { createDispatcher } from "./protocol/dispatcher/dispatcher";
import type { CreateDaemonOptions, Daemon, WsData } from "./createDaemon.types";

const logger = getLogger(["comma", "daemon", "server"]);

/*
 * AI: I think it might be useful to make this into two parts. One part "daemon" where we define the
 * daemon, services runtime details etc. Then we can have a "server.ts" file that is more of the daemon
 * server wrapper, that handles the ws and http request logic side. This way the daemon can be independently
 * created, and the program can either interact with it directly or wrap it in a server and expose it over ports.
 * This will clean up the coupling of the server and daemon, make it more cleaner code wise, and I think reduce complexity.
 */

/**
 * Create a daemon instance.
 *
 * The daemon owns the DaemonStore, Dispatcher, and DaemonRunState.
 * Call `start()` to begin listening and `stop()` to shut down.
 *
 * @param {CreateDaemonOptions} options - Configuration for the daemon instance.
 * @returns {Daemon} Configured daemon instance that can be started and stopped.
 *
 * @example
 * ```ts
 * const daemon = createDaemon({
 *   config: { port: 3000, host: "127.0.0.1", runsDir: "/tmp/runs" },
 * });
 * await daemon.start();
 * ```
 */
export function createDaemon({ config }: CreateDaemonOptions): Daemon {
  const wsMap = new Map<string, ServerWebSocket<WsData>>();
  const startTime = Date.now();
  let server: Server<WsData> | null = null;
  let boundPort = 0;

  const daemonStore = createDaemonStore();
  const hubManager = createHubManager();
  const dispatcher = createDispatcher({
    daemonStore,
    clients: wsMap,
  });
  const daemonRunState = createDaemonRunState({
    daemonStore,
    messageSender: dispatcher,
    runsDir: config.runsDir,
    hubManager,
  });
  const serviceRegistry = createDaemonServiceRegistry({
    services: [
      createRunService({
        daemonRunState,
        daemonStore,
      }),
      createSubscriptionService(daemonRunState, daemonStore),
      createMcpService(daemonRunState, daemonStore),
      createHistoryService(daemonRunState, daemonStore),
      createHubService(daemonRunState, daemonStore, hubManager),
      createCoreService(daemonRunState, daemonStore),
    ],
    messageSender: dispatcher,
  });

  function handleFetch(
    request: Request,
    server: Server<WsData>,
  ): Response | undefined {
    const url = new URL(request.url);

    // WebSocket upgrade at /ws
    if (url.pathname === "/ws") {
      const clientId = crypto.randomUUID();
      const upgraded = server.upgrade(request, { data: { clientId } });
      if (!upgraded) {
        return new Response("WebSocket upgrade failed", { status: 400 });
      }
      // Bun returns undefined on successful upgrade
      return undefined;
    }

    // Health check at /health
    if (url.pathname === "/health" && request.method === "GET") {
      const runStores = daemonStore.listRunStores();
      const activeRuns = runStores.filter((runStore) => {
        const status = runStore.snapshot().status;
        return status === "pending" || status === "running";
      }).length;
      const body = {
        status: "ok",
        uptime: Date.now() - startTime,
        activeRuns,
        connectedClients: daemonStore.getClients().length,
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

      server = Bun.serve<WsData>({
        port: config.port,
        hostname: config.host,
        fetch(request, server) {
          return handleFetch(request, server);
        },
        websocket: {
          open(websocket) {
            const { clientId } = websocket.data;
            daemonStore.addClient(clientId);
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
            void serviceRegistry.handleMessage(clientId, raw);
          },
          close(websocket) {
            const { clientId } = websocket.data;
            daemonStore.removeClient(clientId);
            wsMap.delete(clientId);
            logger.info(`Client disconnected: ${clientId}`);
          },
        },
      });

      //TODO: Handle Unix Socket connections maybe...
      boundPort = server.port ?? config.port;
      logger.info(`Daemon listening on ${config.host}:${boundPort}`);

      // Refresh the models.dev catalog in the background so newer models
      // resolve their context window. Best-effort: loadCatalog falls back to
      // the disk cache or bundled snapshot on failure, and populates the
      // in-memory snapshot the sync resolver reads. Never blocks listening.
      void loadCatalog()
        .then((catalog) => {
          logger.debug(
            `Model catalog loaded (${Object.keys(catalog).length} providers)`,
          );
        })
        .catch((catalogError) => {
          logger.debug(`Model catalog refresh failed: ${String(catalogError)}`);
        });
    },
    async stop(): Promise<void> {
      if (!server) {
        return;
      }

      await daemonRunState.shutdown();

      // Close all WebSocket connections
      for (const [clientId, websocket] of wsMap) {
        try {
          websocket.close(1001, "Server shutting down");
        } catch {
          // Already closed
        }
        daemonStore.removeClient(clientId);
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
