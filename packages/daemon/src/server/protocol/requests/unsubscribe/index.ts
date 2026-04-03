// Unsubscribe request handler.
// Removes a client's subscription from a specific run.

import type { HandlerContext } from "../../dispatcher.types";
import type { UnsubscribeMessage } from "./unsubscribe.schema";

export { UnsubscribeMessage } from "./unsubscribe.schema";

/**
 * Handle an `unsubscribe` request by removing the client from the run's subscriber list.
 */
export function handleUnsubscribe(
  message: UnsubscribeMessage,
  context: HandlerContext<"unsubscribe">,
): void {
  context.state.unsubscribe(context.clientId, message.runId);
}
