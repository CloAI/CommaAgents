// WebSocket server — the daemon's network layer.
//
// `createDaemon()` builds a Bun-native HTTP + WebSocket server that:
//   1. Accepts client connections at `/ws` (WebSocket upgrade)
//   2. Exposes a health check at `/health`
//   3. Parses, validates, and routes incoming client messages
//   4. Implements EventSink so the executor can broadcast events
//   5. Manages client lifecycle (connect/disconnect → state tracking)
//
// The daemon internally constructs the DaemonState, EventSink, and
// StrategyExecutor so there are no circular dependency issues.

import type { Server, ServerWebSocket } from "bun";

import type { DaemonConfig } from "./config";
import type { CredentialStore } from "./credentials/types";
import type { EventSink } from "./executor/event-sink";
import type { ProviderResolver } from "./executor/executor";
import { createStrategyExecutor } from "./executor/executor";
import type { Logger } from "./logger/types";
import { parseClientMessage } from "./protocol/client";
import type { DaemonMessage } from "./protocol/daemon";
import { createDaemonState } from "./state/state";
import type { RunState } from "./state/types";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Per-WebSocket connection data (attached during upgrade). */
interface WsData {
  readonly clientId: string;
}

/** Options for creating a daemon instance. */
export interface CreateDaemonOptions {
  /** Fully resolved daemon configuration. */
  readonly config: DaemonConfig;
  /** Credential store for provider auth resolution. */
  readonly credentialStore: CredentialStore;
  /** Translates (providerId, credential) into a ProviderFactory. */
  readonly providerResolver: ProviderResolver;
  /** Logger for server-level diagnostics. */
  readonly logger: Logger;
  /** Timeout in ms for input/auth bridges. 0 = no timeout. Default: 0. */
  readonly bridgeTimeout?: number;
  /**
   * Override the model for ALL agents in every strategy execution.
   * Format: "providerID/modelID" (e.g., "github-copilot/gpt-4o").
   */
  readonly modelOverride?: string;
}

/** The daemon instance — start/stop the server. */
export interface Daemon {
  /** Start listening for connections. */
  start(): Promise<void>;
  /** Gracefully shut down the server and all connections. */
  stop(): Promise<void>;
  /** The port the server is listening on (available after start). */
  readonly port: number;
  /** The full WebSocket URL (e.g. `ws://127.0.0.1:7422/ws`). */
  readonly url: string;
}

// ---------------------------------------------------------------------------
// Helper: convert RunState → wire RunSummary
// ---------------------------------------------------------------------------

function toRunSummary(run: RunState): Record<string, unknown> {
  return {
    runId: run.id,
    strategyName: run.strategyName,
    status: run.status,
    startedAt: run.startedAt.toISOString(),
    ...(run.completedAt ? { completedAt: run.completedAt.toISOString() } : {}),
  };
}

// ---------------------------------------------------------------------------
// Helper: build a timestamped daemon error message
// ---------------------------------------------------------------------------

function errorMessage(code: string, message: string, requestId?: string): DaemonMessage {
  return {
    type: "error" as const,
    code,
    message,
    ts: new Date().toISOString(),
    ...(requestId !== undefined ? { requestId } : {}),
  };
}

// ---------------------------------------------------------------------------
// createDaemon()
// ---------------------------------------------------------------------------

/**
 * Create a daemon instance.
 *
 * The daemon owns the DaemonState, EventSink, and StrategyExecutor.
 * Call `start()` to begin listening and `stop()` to shut down.
 */
export function createDaemon(options: CreateDaemonOptions): Daemon {
  const {
    config,
    credentialStore,
    providerResolver,
    logger,
    bridgeTimeout = 0,
    modelOverride,
  } = options;

  // -- Internal state -------------------------------------------------------

  const state = createDaemonState();
  const wsMap = new Map<string, ServerWebSocket<WsData>>();
  const startTime = Date.now();
  let server: Server | null = null;
  let boundPort = 0;

  // -- EventSink implementation ---------------------------------------------

  const sink: EventSink = {
    broadcast(runId: string, message: DaemonMessage): void {
      const subscribers = state.getSubscribers(runId);
      const json = JSON.stringify(message);
      for (const clientId of subscribers) {
        const ws = wsMap.get(clientId);
        if (ws) {
          try {
            ws.send(json);
          } catch {
            // Client may have disconnected between getSubscribers and send.
            // The close handler will clean up.
            logger.debug(`Failed to send to client ${clientId}, likely disconnected`);
          }
        }
      }
    },

    send(clientId: string, message: DaemonMessage): void {
      const ws = wsMap.get(clientId);
      if (!ws) {
        logger.debug(`send: client ${clientId} not found in wsMap`);
        return;
      }
      try {
        ws.send(JSON.stringify(message));
      } catch {
        logger.debug(`Failed to send to client ${clientId}`);
      }
    },
  };

  // -- Strategy executor ----------------------------------------------------

  const executor = createStrategyExecutor({
    state,
    sink,
    credentialStore,
    logger: logger.child("executor"),
    providerResolver,
    bridgeTimeout,
    modelOverride,
  });

  // -- Message handler ------------------------------------------------------

  function handleMessage(ws: ServerWebSocket<WsData>, raw: string | Buffer): void {
    const clientId = ws.data.clientId;

    // 1. Parse JSON
    let json: unknown;
    try {
      const text = typeof raw === "string" ? raw : raw.toString("utf-8");
      json = JSON.parse(text);
    } catch {
      ws.send(JSON.stringify(errorMessage("PARSE_ERROR", "Invalid JSON")));
      return;
    }

    // 2. Validate against protocol schema
    const result = parseClientMessage(json);
    if (!result.success) {
      const details = result.error.errors
        .map((e) => `${e.path.join(".")}: ${e.message}`)
        .join("; ");
      ws.send(
        JSON.stringify(
          errorMessage(
            "VALIDATION_ERROR",
            `Invalid message: ${details}`,
            (json as Record<string, unknown>)?.requestId as string | undefined,
          ),
        ),
      );
      return;
    }

    const msg = result.data;

    // 3. Route to handler
    try {
      switch (msg.type) {
        case "ping": {
          const pong: DaemonMessage = {
            type: "pong" as const,
            ts: new Date().toISOString(),
            ...(msg.requestId !== undefined ? { requestId: msg.requestId } : {}),
          };
          ws.send(JSON.stringify(pong));
          break;
        }

        case "start_flow": {
          executor.startRun(clientId, msg.strategyPath, msg.input, msg.requestId);
          // No immediate response — executor broadcasts flow_started via sink
          break;
        }

        case "stop_flow": {
          executor.stopRun(msg.runId);
          break;
        }

        case "user_input": {
          const delivered = executor.handleUserInput(msg.runId, msg.agentName, msg.text);
          if (!delivered) {
            ws.send(
              JSON.stringify(
                errorMessage(
                  "NO_PENDING_INPUT",
                  `No pending input request for run ${msg.runId} agent ${msg.agentName}`,
                  msg.requestId,
                ),
              ),
            );
          }
          break;
        }

        case "provide_auth": {
          // provide_auth handler is async — fire and forget, send error if needed
          executor
            .handleProvideAuth(msg.providerId, msg.credential, msg.scope, msg.persist)
            .then((resolved) => {
              if (!resolved) {
                ws.send(
                  JSON.stringify(
                    errorMessage(
                      "NO_PENDING_AUTH",
                      `No pending auth request for provider ${msg.providerId}`,
                      msg.requestId,
                    ),
                  ),
                );
              }
            })
            .catch((err) => {
              logger.error(`provide_auth handler error: ${err}`);
              ws.send(
                JSON.stringify(
                  errorMessage("INTERNAL_ERROR", "Failed to process auth", msg.requestId),
                ),
              );
            });
          break;
        }

        case "list_flows": {
          const runs = state.listRuns();
          const summaries = runs.map(toRunSummary);
          const listMsg: DaemonMessage = {
            type: "flow_list" as const,
            runs: summaries as any,
            ts: new Date().toISOString(),
            ...(msg.requestId !== undefined ? { requestId: msg.requestId } : {}),
          };
          ws.send(JSON.stringify(listMsg));
          break;
        }

        case "subscribe": {
          try {
            state.subscribe(clientId, msg.runId);
          } catch (err) {
            ws.send(
              JSON.stringify(
                errorMessage(
                  "SUBSCRIBE_ERROR",
                  err instanceof Error ? err.message : String(err),
                  msg.requestId,
                ),
              ),
            );
          }
          break;
        }

        case "unsubscribe": {
          state.unsubscribe(clientId, msg.runId);
          break;
        }
      }
    } catch (err) {
      logger.error(`Message handler error: ${err}`);
      ws.send(
        JSON.stringify(
          errorMessage(
            "INTERNAL_ERROR",
            err instanceof Error ? err.message : String(err),
            msg.requestId,
          ),
        ),
      );
    }
  }

  // -- HTTP fetch handler ---------------------------------------------------

  function handleFetch(req: Request, srv: Server): Response | undefined {
    const url = new URL(req.url);

    // WebSocket upgrade at /ws
    if (url.pathname === "/ws") {
      const clientId = crypto.randomUUID();
      const upgraded = srv.upgrade<WsData>(req, { data: { clientId } });
      if (!upgraded) {
        return new Response("WebSocket upgrade failed", { status: 400 });
      }
      // Bun returns undefined on successful upgrade
      return undefined;
    }

    // Health check at /health
    if (url.pathname === "/health" && req.method === "GET") {
      const runs = state.listRuns();
      const activeRuns = runs.filter(
        (r) => r.status === "pending" || r.status === "running",
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

  // -- Daemon public API ----------------------------------------------------

  const daemon: Daemon = {
    async start(): Promise<void> {
      if (server) {
        throw new Error("Daemon is already running");
      }

      server = Bun.serve<WsData>({
        port: config.port,
        hostname: config.host,

        fetch(req, srv) {
          return handleFetch(req, srv);
        },

        websocket: {
          open(ws) {
            const { clientId } = ws.data;
            state.addClient(clientId);
            wsMap.set(clientId, ws);
            logger.info(`Client connected: ${clientId}`);
          },

          message(ws, raw) {
            handleMessage(ws, raw);
          },

          close(ws) {
            const { clientId } = ws.data;
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
      for (const [clientId, ws] of wsMap) {
        try {
          ws.close(1001, "Server shutting down");
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
