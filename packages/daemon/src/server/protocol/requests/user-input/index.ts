// User-input request handler.
// Routes user text input to a pending input request on a running flow.

import type { HandlerContext } from "../../dispatcher/dispatcher.types";
import { NO_PENDING_INPUT } from "./user-input.constants";
import type { UserInputMessage } from "./user-input.schema";

export { UserInputMessage } from "./user-input.schema";

/**
 * Handle a `user_input` request by resolving the run's pending input.
 *
 * If no pending input request exists for the specified run/agent,
 * sends a `NO_PENDING_INPUT` error back to the client.
 *
 * @param {UserInputMessage} message - Input response received from the client.
 * @param {HandlerContext<"user_input">} context - Request handler context used to reply.
 * @returns {void} Nothing; resolves input or sends an error response.
 */
export function handleUserInput(
  message: UserInputMessage,
  context: HandlerContext<"user_input">,
): void {
  const delivered = context.daemonRunState.resolveInput(
    message.runId,
    message.agentName,
    message.text,
  );
  if (!delivered) {
    context.reply({
      type: "error" as const,
      code: NO_PENDING_INPUT,
      message: `No pending input request for run ${message.runId} agent ${message.agentName}`,
      ts: new Date().toISOString(),
      ...(message.requestId !== undefined
        ? { requestId: message.requestId }
        : {}),
    });
  }
}
