// Subscribe request handler.
// Subscribes a client to events from a specific run.

import type { HandlerContext } from "../../dispatcher.types";
import { SUBSCRIBE_ERROR } from "./subscribe.constants";
import type { SubscribeMessage } from "./subscribe.schema";

export { SubscribeMessage } from "./subscribe.schema";

/**
 * Handle a `subscribe` request by registering the client for run events.
 *
 * Sends a `SUBSCRIBE_ERROR` if the run does not exist or the client
 * is not registered in state.
 */
export function handleSubscribe(
  message: SubscribeMessage,
  context: HandlerContext<"subscribe">,
): void {
  try {
    context.state.subscribe(context.clientId, message.runId);
  } catch (caughtError) {
    context.reply({
      type: "error" as const,
      code: SUBSCRIBE_ERROR,
      message: caughtError instanceof Error ? caughtError.message : String(caughtError),
      ts: new Date().toISOString(),
      ...(message.requestId !== undefined ? { requestId: message.requestId } : {}),
    });
  }
}
