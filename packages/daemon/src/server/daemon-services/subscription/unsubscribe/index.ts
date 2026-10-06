// Unsubscribe request handler.
// Removes a client's subscription from a specific run.

import type { HandlerContext } from "../../../protocol/dispatcher/dispatcher.types";
import type { UnsubscribeMessage } from "./unsubscribe.schema";

export { UnsubscribeMessage } from "./unsubscribe.schema";

/**
 * Handle an `unsubscribe` request by removing the client from the run's subscriber list.
 *
 * @param {UnsubscribeMessage} message - Request identifying the run to unsubscribe from.
 * @param {HandlerContext<"unsubscribe">} context - Request handler context.
 * @returns {void} Nothing; removes the subscription when the run exists.
 */
export function handleUnsubscribe(
  message: UnsubscribeMessage,
  context: HandlerContext<"unsubscribe">,
): void {
  context.daemonStore
    .getRunStore(message.runId)
    ?.removeSubscriber(context.clientId);
}
