import { DISABLED } from "uWebSockets.js";
import type { ListenOptions } from "uWebSockets.js";

export const MAX_BACKPRESSURE_BYTES = 16 * 1024 * 1024;
export const CLOSE_FRAME_RESERVE_BYTES = 128;
export const WEBSOCKET_BEHAVIOR = {
  maxPayloadLength: 16 * 1024 * 1024,
  maxBackpressure: MAX_BACKPRESSURE_BYTES,
  closeOnBackpressureLimit: false,
  idleTimeout: 120,
  sendPingsAutomatically: true,
  compression: DISABLED,
};
// The runtime exports a flat constant, although its declarations describe an enum.
export const EXCLUSIVE_LISTEN_OPTIONS: ListenOptions = 1;
