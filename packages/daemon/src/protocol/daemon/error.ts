// Daemon → Client: error
// Protocol-level error (bad message, unknown run, etc.).

import { z } from "zod";
import { DaemonBase } from "../shared";

export const ErrorMessage = DaemonBase.extend({
  type: z.literal("error"),
  /** Machine-readable error code. */
  code: z.string(),
  /** Human-readable error message. */
  message: z.string(),
});

export type ErrorMessage = z.infer<typeof ErrorMessage>;
