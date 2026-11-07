import uWS from "uWebSockets.js";
import type { TemplatedApp, WebSocket } from "uWebSockets.js";
import { createBindingRegistry } from "./registry";
import { createConnection } from "./connections";
import { closeSocket, sendSocketMessage } from "./transport";
import {
  EXCLUSIVE_LISTEN_OPTIONS,
  WEBSOCKET_BEHAVIOR,
} from "./transport/transport.constants";
import type {
  CreateDaemonServerOptions,
  DaemonServer,
  PluginSocketData,
} from "./daemon-server.types";

/**
 * Expose plugin commands and channels over WebSocket without owning daemon lifetime.
 * @param {CreateDaemonServerOptions} options - Independent kernel and listener address.
 * @returns {DaemonServer} Listener and transport cleanup controls.
 * @example
 * const server = createDaemonServer({ daemon, port: 7422 });
 * await server.start();
 */
export function createDaemonServer({
  daemon,
  host = "127.0.0.1",
  port = 7422,
}: CreateDaemonServerOptions): DaemonServer {
  const registry = createBindingRegistry(daemon.plugins);
  const sockets = new Set<WebSocket<PluginSocketData>>();
  let server: TemplatedApp | undefined;
  let boundPort = 0;
  let stopping: Promise<void> | undefined;

  return {
    async start() {
      if (server || stopping) {
        throw new Error("Server is already running or stopping");
      }
      const listener = uWS.App();
      server = listener;
      listener.ws<PluginSocketData>("/ws", {
        ...WEBSOCKET_BEHAVIOR,
        open(socket) {
          sockets.add(socket);
          socket.getUserData().connection = createConnection({
            registry,
            send(message) {
              sendSocketMessage(socket, message, () => sockets.has(socket));
            },
            close(code, reason) {
              closeSocket(socket, code, reason, () => sockets.has(socket));
            },
          });
        },
        message(socket, message, isBinary) {
          if (isBinary) {
            closeSocket(socket, 1008, "Expected a JSON text message", () =>
              sockets.has(socket),
            );
            return;
          }
          void socket
            .getUserData()
            .connection?.receive(Buffer.from(message).toString("utf8"));
        },
        close(socket) {
          sockets.delete(socket);
          const data = socket.getUserData();
          const connection = data.connection;
          data.connection = undefined;
          void connection?.dispose();
        },
      });
      listener.any("/ws", (response) => {
        response
          .writeStatus("400 Bad Request")
          .end("WebSocket upgrade required");
      });
      listener.any("/*", (response) => {
        response.writeStatus("404 Not Found").end("Not Found");
      });
      await new Promise<void>((resolve, reject) => {
        listener.listen(host, port, EXCLUSIVE_LISTEN_OPTIONS, (socket) => {
          if (!socket) {
            server = undefined;
            listener.close();
            reject(new Error(`Failed to listen on ${host}:${port}`));
            return;
          }
          boundPort = uWS.us_socket_local_port(socket);
          resolve();
        });
      });
    },
    stop() {
      if (stopping) {
        return stopping;
      }
      const listener = server;
      if (!listener) {
        return Promise.resolve();
      }
      stopping = (async () => {
        const connections = [...sockets].map(
          (socket) => socket.getUserData().connection,
        );
        for (const socket of sockets) {
          closeSocket(socket, 1001, "Server shutting down", () =>
            sockets.has(socket),
          );
        }
        listener.close();
        const cleanup = connections.map((connection) => connection?.dispose());
        await Promise.allSettled(cleanup);
        sockets.clear();
        server = undefined;
        boundPort = 0;
      })().finally(() => {
        stopping = undefined;
      });
      return stopping;
    },
    get port() {
      return boundPort;
    },
    get url() {
      return `ws://${host.includes(":") ? `[${host}]` : host}:${boundPort}/ws`;
    },
  };
}
