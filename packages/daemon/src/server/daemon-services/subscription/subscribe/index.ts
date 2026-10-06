// Subscribe request handler.
// Subscribes a client to events from a specific run.

import { HandlerContext } from "../../../protocol/dispatcher/dispatcher.types";
import { SUBSCRIBE_ERROR } from "./subscribe.constants";
import type { SubscribeMessage } from "./subscribe.schema";

export { SubscribeMessage } from "./subscribe.schema";

/**
 * Handle a `subscribe` request by registering the client for run events.
 *
 * Sends a `SUBSCRIBE_ERROR` if the run does not exist or the client
 * is not registered in state.
 *
 * @param {SubscribeMessage} message - Request identifying the run to subscribe to.
 * @param {HandlerContext<"subscribe">} context - Request handler context used to reply.
 * @returns {void} Nothing; updates the subscription or sends an error response.
 */
export function handleSubscribe(
  message: SubscribeMessage,
  context: HandlerContext<"subscribe">,
): void {
  try {
    if (!context.daemonStore.getClients().includes(context.clientId)) {
      throw new Error(`Client not found: ${context.clientId}`);
    }
    const runStore = context.daemonStore.getRunStore(message.runId);
    if (!runStore) throw new Error(`Run not found: ${message.runId}`);
    runStore.addSubscriber(context.clientId);
  } catch (caughtError) {
    context.reply({
      type: "error" as const,
      code: SUBSCRIBE_ERROR,
      message:
        caughtError instanceof Error
          ? caughtError.message
          : String(caughtError),
      ts: new Date().toISOString(),
      ...(message.requestId !== undefined
        ? { requestId: message.requestId }
        : {}),
    });
  }
}
