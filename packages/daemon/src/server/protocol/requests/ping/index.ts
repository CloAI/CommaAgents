// Ping request handler.
// Responds with a pong message to keep the connection alive.

import type { HandlerContext } from "../../dispatcher.types";
import type { PingMessage } from "./ping.schema";

export { PingMessage } from "./ping.schema";

/**
 * Handle a `ping` request by sending back a `pong` response.
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
