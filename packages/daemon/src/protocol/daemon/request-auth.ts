// Daemon → Client: request_auth
// Sent when a provider needs authentication credentials.

import { z } from "zod";
import { DaemonBase } from "../shared";

export const RequestAuthMessage = DaemonBase.extend({
  type: z.literal("request_auth"),
  /** The provider ID that needs authentication. */
  providerId: z.string(),
  /** The run ID that triggered this auth request. */
  runId: z.string(),
  /** The environment variable name the key is typically stored in. */
  envVar: z.string().optional(),
});

export type RequestAuthMessage = z.infer<typeof RequestAuthMessage>;
