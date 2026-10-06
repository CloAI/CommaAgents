// Update-policy request handler.
// Applies a policy patch to a guard of a running strategy.

import type { HandlerContext } from "../../dispatcher/dispatcher.types";
import type { UpdatePolicyMessage } from "./update-policy.schema";

export { UpdatePolicyMessage } from "./update-policy.schema";

/**
 * Handle an `update_policy` request by applying the patch to the run's guard.
 *
 * If no active run is found for the specified `runId`, sends a `RUN_NOT_FOUND`
 * error back to the client.
 *
 * @param {UpdatePolicyMessage} message - Request containing the policy patch.
 * @param {HandlerContext<"update_policy">} context - Request handler context used to reply.
 * @returns {void} Nothing; applies the policy or sends an error response.
 */
export function handleUpdatePolicy(
  message: UpdatePolicyMessage,
  context: HandlerContext<"update_policy">,
): void {
  const applied = context.daemonRunState.updatePolicy(
    message.runId,
    {
      mode: message.mode,
      allow: message.allow,
      deny: message.deny,
      default: message.default,
    },
    message.tool,
  );
  if (!applied) {
    context.reply({
      type: "error" as const,
      code: "RUN_NOT_FOUND",
      message: `No active run found for runId ${message.runId}`,
      ts: new Date().toISOString(),
      ...(message.requestId !== undefined
        ? { requestId: message.requestId }
        : {}),
    });
  }
}
