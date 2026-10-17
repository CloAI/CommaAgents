import type { Server, ServerWebSocket } from "bun";
import { createBindingRegistry } from "./registry";
import { createConnection } from "./connections";
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
  const sockets = new Set<ServerWebSocket<PluginSocketData>>();
  let server: Server<PluginSocketData> | undefined;
  let stopping: Promise<void> | undefined;

  return {
    async start() {
      if (server || stopping) {
        throw new Error("Server is already running or stopping");
      }
      server = Bun.serve<PluginSocketData>({
        hostname: host,
        port,
        fetch(request, listener) {
          if (new URL(request.url).pathname !== "/ws") {
            return new Response("Not Found", { status: 404 });
          }
          if (!listener.upgrade(request, { data: {} })) {
            return new Response("WebSocket upgrade required", { status: 400 });
          }
        },
        websocket: {
          open(socket) {
            sockets.add(socket);
            socket.data.connection = createConnection({
              registry,
              send: socket.send.bind(socket),
              close: socket.close.bind(socket),
            });
          },
          message(socket, message) {
            if (typeof message !== "string") {
              socket.close(1008, "Expected a JSON text message");
              void socket.data.connection?.dispose();
              return;
            }
            void socket.data.connection?.receive(message);
          },
          close(socket) {
            sockets.delete(socket);
            const connection = socket.data.connection;
            socket.data.connection = undefined;
            void connection?.dispose();
          },
        },
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
          (socket) => socket.data.connection,
        );
        // Bun stops listening immediately; awaiting this promise can retain already-closed upgrades.
        void listener.stop(true);
        const cleanup = connections.map((connection) => connection?.dispose());
        await Promise.allSettled(cleanup);
        sockets.clear();
        server = undefined;
      })().finally(() => {
        stopping = undefined;
      });
      return stopping;
    },
    get port() {
      return server?.port ?? 0;
    },
    get url() {
      return `ws://${host.includes(":") ? `[${host}]` : host}:${server?.port ?? 0}/ws`;
    },
  };
}
