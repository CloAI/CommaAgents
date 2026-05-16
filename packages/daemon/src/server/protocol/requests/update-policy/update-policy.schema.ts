// Client → Daemon: update_policy
// Sent by the client to patch a guard's policy chain for a run.
// Useful for pre-approving or pre-denying paths before execution reaches them.

import { z } from "zod";
import { ClientBase } from "../../shared";

export const UpdatePolicyMessage = ClientBase.extend({
  type: z.literal("update_policy"),
  /** The run ID whose guard should be updated. */
  runId: z.string().min(1),
  /** Which tool to apply the policy to. If omitted, applies to all guards. */
  tool: z.string().optional(),
  /** Which policy dimension to update. */
  mode: z.enum(["read", "write"]),
  /** Additional glob patterns to append to the allow list. */
  allow: z.array(z.string()).optional(),
  /** Additional glob patterns to append to the deny list. */
  deny: z.array(z.string()).optional(),
  /** Replace the default decision for this dimension. */
  default: z.enum(["allow", "deny", "ask"]).optional(),
});

export type UpdatePolicyMessage = z.infer<typeof UpdatePolicyMessage>;
