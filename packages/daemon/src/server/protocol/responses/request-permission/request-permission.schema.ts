// Daemon → Client: request_permission
// Sent when a sandbox policy resolves to "ask" and needs a human decision.

import { z } from "zod";
import { DaemonBase } from "../../shared";

export const RequestPermissionMessage = DaemonBase.extend({
  type: z.literal("request_permission"),
  /** The run ID that needs a permission decision. */
  runId: z.string(),
  /** Unique ID for this permission request. Echoed in the client's permission_decision. */
  requestId: z.string(),
  /** Name of the agent that triggered the operation. */
  agentName: z.string(),
  /** Name of the tool that triggered the operation, if known. */
  toolName: z.string().optional(),
  /** Category of the operation being requested. */
  operation: z.enum(["fs.read", "fs.write", "fs.exec"]),
  /** Resolved absolute path (or other resource identifier) being accessed. */
  resource: z.string(),
  /**
   * Why this request is being raised.
   * - `"policy-ask"` — the policy for this path is set to `"ask"`.
   * - `"policy-deny-override"` — a session-deny is in place but the tool requests a one-time override.
   */
  reason: z.enum(["policy-ask", "policy-deny-override"]),
  /** Optional extra context for the UI (e.g. content about to be written). */
  details: z.record(z.unknown()).optional(),
});

export type RequestPermissionMessage = z.infer<typeof RequestPermissionMessage>;
