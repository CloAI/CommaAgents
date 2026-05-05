// Daemon → Client: policy_updated
// Broadcast when the sandbox's in-memory policy changes (e.g. after
// an "allow-session" or "deny-session" decision, or an update_policy message).

import { z } from "zod";
import { DaemonBase } from "../../shared";

const PathPolicyWire = z.object({
  default: z.enum(["allow", "deny", "ask"]),
  allow: z.array(z.string()).optional(),
  deny: z.array(z.string()).optional(),
});

export const PolicyUpdatedMessage = DaemonBase.extend({
  type: z.literal("policy_updated"),
  /** The run ID whose sandbox policy changed. */
  runId: z.string(),
  /** Current read policy snapshot after the update. */
  read: PathPolicyWire,
  /** Current write policy snapshot after the update. */
  write: PathPolicyWire,
});

export type PolicyUpdatedMessage = z.infer<typeof PolicyUpdatedMessage>;
