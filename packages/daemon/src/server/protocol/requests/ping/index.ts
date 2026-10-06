// Ping request handler.
// Responds with a pong message to keep the connection alive.

import type { HandlerContext } from "../../dispatcher/dispatcher.types";
import type { PingMessage } from "./ping.schema";

export { PingMessage } from "./ping.schema";

/**
 * Handle a `ping` request by sending back a `pong` response.
 *
 * @param {PingMessage} message - Ping request received from the client.
 * @param {HandlerContext<"ping">} context - Request handler context used to reply.
 * @returns {void} Nothing; replies through the handler context.
 */
export function handlePing(
  message: PingMessage,
  context: HandlerContext<"ping">,
): void {
  context.reply({
    type: "pong" as const,
    ts: new Date().toISOString(),
    ...(message.requestId !== undefined
      ? { requestId: message.requestId }
      : {}),
  });
}
