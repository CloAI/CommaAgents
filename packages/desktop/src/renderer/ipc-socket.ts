import type { HostSocket } from "@comma-agents/ui";
import type { DesktopBridge } from "../shared/ipc";

/** The normal-closure code reported when the daemon cannot be reached. */
const UNAVAILABLE = 1011;
const CLOSED = 3;

/**
 * Present one Electron IPC daemon connection as the socket the UI already speaks.
 * Opening resolves asynchronously; a failed start closes the socket with the daemon's reason.
 * @param {DesktopBridge["daemon"]} daemon - The preload bridge to the in-process daemon.
 * @returns {HostSocket} A connecting socket.
 */
export function createIpcSocket(daemon: DesktopBridge["daemon"]): HostSocket {
  let id: number | undefined;
  let release: Array<() => void> = [];

  const detach = () => {
    for (const stop of release) {
      stop();
    }
    release = [];
  };

  const socket: HostSocket = {
    readyState: 0,
    onopen: null,
    onmessage: null,
    onerror: null,
    onclose: null,
    send(data) {
      if (socket.readyState !== 1 || id === undefined) {
        throw new Error("The daemon connection is not open.");
      }
      daemon.send(id, data);
    },
    close() {
      if (socket.readyState === CLOSED) {
        return;
      }
      socket.readyState = CLOSED;
      detach();
      if (id !== undefined) {
        daemon.close(id);
      }
    },
  };

  const end = (code: number, reason: string) => {
    if (socket.readyState === CLOSED) {
      return;
    }
    socket.readyState = CLOSED;
    detach();
    socket.onclose?.({ code, reason });
  };

  daemon.open().then(
    (result) => {
      if (!result.ok) {
        end(UNAVAILABLE, result.reason);
        return;
      }
      if (socket.readyState === CLOSED) {
        // Closed while connecting: hand the new connection straight back.
        daemon.close(result.id);
        return;
      }
      id = result.id;
      release = [
        daemon.onMessage((event) => {
          if (event.id === id) {
            socket.onmessage?.({ data: event.text });
          }
        }),
        daemon.onClosed((event) => {
          if (event.id === id) {
            end(event.code, event.reason);
          }
        }),
      ];
      socket.readyState = 1;
      socket.onopen?.();
    },
    (error: unknown) =>
      end(UNAVAILABLE, error instanceof Error ? error.message : String(error)),
  );
  return socket;
}
