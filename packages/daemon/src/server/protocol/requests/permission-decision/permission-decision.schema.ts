// Client → Daemon: permission_decision
// Sent by the client in response to a request_permission event.

import { z } from "zod";
import { ClientBase } from "../../shared";

export const PermissionDecisionMessage = ClientBase.extend({
  type: z.literal("permission_decision"),
  /** The run ID this decision is for. */
  runId: z.string().min(1),
  /**
   * The requestId from the matching request_permission message.
   * Used to correlate the decision with the pending sandbox request.
   */
  permissionRequestId: z.string().min(1),
  /**
   * The client's decision.
   * - `"allow"` / `"deny"` — one-shot for this invocation only.
   * - `"allow-session"` / `"deny-session"` — remembered for the lifetime of this run.
   */
  decision: z.enum(["allow", "deny", "allow-session", "deny-session"]),
});

export type PermissionDecisionMessage = z.infer<
  typeof PermissionDecisionMessage
>;
