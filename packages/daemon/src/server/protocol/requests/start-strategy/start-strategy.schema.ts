// Client → Daemon: start_strategy
// Start a strategy execution by file path.

import { z } from "zod";
import { ClientBase } from "../../shared";

export const StartStrategyMessage = ClientBase.extend({
  type: z.literal("start_strategy"),
  /** Path to the strategy JSON/YAML file. */
  strategyPath: z.string().min(1),
  /** Optional initial input message for the strategy. */
  input: z.string().optional(),
  /**
   * Override the model for ALL agents in this strategy execution.
   * Format: "providerID/modelID" (e.g., "openai/gpt-4o", "anthropic/claude-sonnet-4-20250514").
   * When set, ignores model strings in the strategy file.
   */
  modelOverride: z.string().min(1).optional(),
  /**
   * Working directory for the strategy's sandbox.
   * Defaults to the daemon's `process.cwd()` when not provided.
   */
  cwd: z.string().min(1).optional(),
});

export type StartStrategyMessage = z.infer<typeof StartStrategyMessage>;
