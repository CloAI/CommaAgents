// Daemon → Client: strategy_error
// Sent when a strategy encounters an error.

import { z } from "zod";
import { DaemonBase } from "../../shared";

/** Structured error info sent in error messages. */
export const ErrorInfoSchema = z.object({
  code: z.string(),
  message: z.string(),
});
export type ErrorInfo = z.infer<typeof ErrorInfoSchema>;

export const StrategyErrorMessage = DaemonBase.extend({
  type: z.literal("strategy_error"),
  /** The run ID that errored. */
  runId: z.string(),
  /** Structured error information. */
  error: ErrorInfoSchema,
});

export type StrategyErrorMessage = z.infer<typeof StrategyErrorMessage>;
