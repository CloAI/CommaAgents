// Permission-decision request handler.
// Routes a permission decision to the pending sandbox request on a running flow.

import type { HandlerContext } from "../../dispatcher.types";
import type { PermissionDecisionMessage } from "./permission-decision.schema";

export { PermissionDecisionMessage } from "./permission-decision.schema";

/**
 * Handle a `permission_decision` request by delivering the decision to the
 * permission bridge.
 *
 * If no pending permission request exists for the specified `permissionRequestId`,
 * sends a `NO_PENDING_PERMISSION` error back to the client.
 */
export function handlePermissionDecision(
  message: PermissionDecisionMessage,
  context: HandlerContext<"permission_decision">,
): void {
  const delivered = context.executor.handlePermissionDecision(
    message.runId,
    message.permissionRequestId,
    message.decision,
  );
  if (!delivered) {
    context.reply({
      type: "error" as const,
      code: "NO_PENDING_PERMISSION",
      message: `No pending permission request ${message.permissionRequestId} for run ${message.runId}`,
      ts: new Date().toISOString(),
      ...(message.requestId !== undefined ? { requestId: message.requestId } : {}),
    });
  }
}
