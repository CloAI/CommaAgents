// Daemon → Client: policy_updated
// Broadcast when a guard's policy chain changes (e.g. after
// an "allow-session" or "deny-session" decision, or an update_policy message).

import { z } from "zod";
import { DaemonBase } from "../../shared";

const PolicyWire = z.object({
  name: z.string(),
});

export const PolicyUpdatedMessage = DaemonBase.extend({
  type: z.literal("policy_updated"),
  /** The run ID whose guard policy changed. */
  runId: z.string(),
  /** Which tool's guard changed. */
  tool: z.string(),
  /** Current policy chain snapshot after the update. */
  policies: z.array(PolicyWire),
});

export type PolicyUpdatedMessage = z.infer<typeof PolicyUpdatedMessage>;
