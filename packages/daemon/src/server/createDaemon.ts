import { getLogger } from "@logtape/logtape";
import { loadCatalog } from "@comma-agents/core";
import { createHubManager } from "@comma-agents/core/hub";
import uWS from "uWebSockets.js";
import type { TemplatedApp, WebSocket } from "uWebSockets.js";
import { closeSocket } from "../daemon-server/transport";
import {
  EXCLUSIVE_LISTEN_OPTIONS,
  WEBSOCKET_BEHAVIOR,
} from "../daemon-server/transport/transport.constants";
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
  const wsMap = new Map<string, WebSocket<WsData>>();
  const startTime = Date.now();
  let server: TemplatedApp | null = null;
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

  const daemon: Daemon = {
    async start(): Promise<void> {
      if (server) {
        throw new Error("Daemon is already running");
      }

      const listener = uWS.App();
      server = listener;
      listener.ws<WsData>("/ws", {
        ...WEBSOCKET_BEHAVIOR,
        upgrade(response, request, context) {
          response.upgrade(
            { clientId: crypto.randomUUID() },
            request.getHeader("sec-websocket-key"),
            request.getHeader("sec-websocket-protocol"),
            request.getHeader("sec-websocket-extensions"),
            context,
          );
        },
        open(websocket) {
          const { clientId } = websocket.getUserData();
          daemonStore.addClient(clientId);
          wsMap.set(clientId, websocket);
          logger.info(`Client connected: ${clientId}`);
        },
        message(websocket, message, isBinary) {
          const { clientId } = websocket.getUserData();
          // Native incoming buffers expire when this callback returns.
          const raw = isBinary
            ? Buffer.from(new Uint8Array(message))
            : Buffer.from(message).toString("utf8");
          const preview = typeof raw === "string" ? raw : raw.toString("utf8");
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
          const { clientId } = websocket.getUserData();
          daemonStore.removeClient(clientId);
          wsMap.delete(clientId);
          logger.info(`Client disconnected: ${clientId}`);
        },
      });
      listener.any("/ws", (response) => {
        response.writeStatus("400 Bad Request").end("WebSocket upgrade failed");
      });
      listener.get("/health", (response) => {
        const activeRuns = daemonStore.listRunStores().filter((runStore) => {
          const status = runStore.snapshot().status;
          return status === "pending" || status === "running";
        }).length;
        response.writeHeader("Content-Type", "application/json").end(
          JSON.stringify({
            status: "ok",
            uptime: Date.now() - startTime,
            activeRuns,
            connectedClients: daemonStore.getClients().length,
          }),
        );
      });
      listener.any("/*", (response) => {
        response.writeStatus("404 Not Found").end("Not Found");
      });
      await new Promise<void>((resolve, reject) => {
        listener.listen(config.host, config.port, EXCLUSIVE_LISTEN_OPTIONS, (socket) => {
          if (!socket) {
            server = null;
            listener.close();
            reject(
              new Error(`Failed to listen on ${config.host}:${config.port}`),
            );
            return;
          }
          boundPort = uWS.us_socket_local_port(socket);
          resolve();
        });
      });
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
          closeSocket(
            websocket,
            1001,
            "Server shutting down",
            () => wsMap.get(clientId) === websocket,
          );
        } catch {
          // Already closed
        }
        daemonStore.removeClient(clientId);
      }
      wsMap.clear();

      // Stop the HTTP server
      server.close();
      server = null;
      boundPort = 0;

      logger.info("Daemon stopped");
    },
    get port(): number {
      return boundPort;
    },
    get url(): string {
      return `ws://${config.host.includes(":") ? `[${config.host}]` : config.host}:${boundPort}/ws`;
    },
  };

  return daemon;
}
