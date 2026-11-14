import type { WebSocket } from "uWebSockets.js";
import {
  CLOSE_FRAME_RESERVE_BYTES,
  MAX_BACKPRESSURE_BYTES,
} from "./transport.constants";

/**
 * Close a socket only while its transport still owns the native connection.
 * @param {WebSocket<UserData>} socket - Native connection owned by the listener.
 * @param {number} code - WebSocket close status.
 * @param {string} reason - Human-readable close reason.
 * @param {() => boolean} isConnected - Whether the listener still owns this socket.
 * @returns {void} Returns after requesting closure or ignoring a closed socket.
 * @internal
 */
export function closeSocket<UserData>(
  socket: WebSocket<UserData>,
  code: number,
  reason: string,
  isConnected: () => boolean,
): void {
  if (isConnected()) {
    socket.end(code, reason);
  }
}

/**
 * Bound queued frames and close slow consumers before a close frame would be dropped.
 * @param {WebSocket<UserData>} socket - Native connection owned by the listener.
 * @param {string} message - Encoded JSON text frame.
 * @param {() => boolean} isConnected - Whether the listener still owns this socket.
 * @returns {void} Returns after sending, closing a slow consumer, or ignoring a closed socket.
 * @internal
 */
export function sendSocketMessage<UserData>(
  socket: WebSocket<UserData>,
  message: string,
  isConnected: () => boolean,
): void {
  if (!isConnected()) {
    return;
  }
  if (
    socket.getBufferedAmount() +
      Buffer.byteLength(message) +
      CLOSE_FRAME_RESERVE_BYTES >
    MAX_BACKPRESSURE_BYTES
  ) {
    closeSocket(
      socket,
      1013,
      "WebSocket backpressure limit exceeded",
      isConnected,
    );
    return;
  }
  const status = socket.send(message, false);
  if (status === 2 || socket.getBufferedAmount() > MAX_BACKPRESSURE_BYTES) {
    closeSocket(
      socket,
      1013,
      "WebSocket backpressure limit exceeded",
      isConnected,
    );
  }
}
