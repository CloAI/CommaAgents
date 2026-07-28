import { loadCatalog } from "@comma-agents/core";
import { createHubManager } from "@comma-agents/core/hub";
import type { Server, ServerWebSocket } from "bun";
import {
  createClientLifecycleEffect,
  createDaemonEventDispatcher,
  createRunLifecycleEffect,
} from "../daemon-effects";
import { createDaemonRunState } from "../daemon-run-state/daemon-run-state";
import {
  createCoreService,
  createDaemonServiceRegistry,
  createHistoryService,
  createHubService,
  createMcpService,
  createProviderService,
  createRunService,
  createSubscriptionService,
} from "../daemon-services";
import { createDaemonStore } from "../daemon-store/daemon-store";
import { createDispatcher } from "./protocol/dispatcher/dispatcher";
import type { CreateDaemonOptions, Daemon, WsData } from "./server.types";

/**
 * Create a daemon instance.
 *
 * The daemon owns the DaemonStore, Dispatcher, and DaemonRunState.
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
export function createDaemon({ config, logger }: CreateDaemonOptions): Daemon {
  const wsMap = new Map<string, ServerWebSocket<WsData>>();
  const startTime = Date.now();
  let server: Server<WsData> | null = null;
  let boundPort = 0;

  const daemonStore = createDaemonStore();
  const hubManager = createHubManager();
  const dispatcher = createDispatcher({
    daemonStore,
    clients: wsMap,
    logger: logger.child("dispatcher"),
  });
  const events = createDaemonEventDispatcher({
    daemonStore,
    effects: [
      createClientLifecycleEffect(logger),
      createRunLifecycleEffect(logger.child("run-lifecycle")),
    ],
    logger: logger.child("effects"),
  });
  const daemonRunState = createDaemonRunState({
    daemonStore,
    messageSender: dispatcher,
    logger: logger.child("daemon-run-state"),
    runsDir: config.runsDir,
    hubManager,
    events,
  });
  const serviceDependencies = {
    daemonRunState,
    daemonStore,
    logger: logger.child("services"),
  };
  const serviceRegistry = createDaemonServiceRegistry({
    services: [
      createRunService(serviceDependencies),
      createSubscriptionService(
        daemonRunState,
        daemonStore,
        serviceDependencies.logger,
      ),
      createMcpService(daemonRunState, daemonStore, serviceDependencies.logger),
      createProviderService(
        daemonRunState,
        daemonStore,
        serviceDependencies.logger,
      ),
      createHistoryService(
        daemonRunState,
        daemonStore,
        serviceDependencies.logger,
      ),
      createHubService(
        daemonRunState,
        daemonStore,
        hubManager,
        serviceDependencies.logger,
      ),
      createCoreService(
        daemonRunState,
        daemonStore,
        serviceDependencies.logger,
      ),
    ],
    messageSender: dispatcher,
    events,
    logger: logger.child("service-registry"),
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
      const runs = daemonStore.listRuns();
      const activeRuns = runs.filter(
        (run) => run.status === "pending" || run.status === "running",
      ).length;
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
            events.publish({ type: "client.runtime.connected", clientId });
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
            events.publish({ type: "client.runtime.disconnected", clientId });
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
      if (!server) return;

      await daemonRunState.shutdown();
      serviceRegistry.dispose();
      events.dispose();

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
