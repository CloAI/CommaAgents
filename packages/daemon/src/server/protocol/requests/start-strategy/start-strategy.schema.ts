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
  /**
   * Path to a comma-project.json manifest for folder-based strategy projects.
   * When provided, the daemon loads the project (runs entry + registers custom tools)
   * before loading the strategy. The `strategyPath` is resolved relative to the
   * manifest's directory.
   */
  manifestPath: z.string().min(1).optional(),
  /**
   * Optional run ID from a previous execution to continue the conversation from.
   * When provided, the daemon loads the previous run's conversation history
   * and passes it to the agents so they can continue from where they left off.
   */
  previousRunId: z.string().min(1).optional(),
});

export type StartStrategyMessage = z.infer<typeof StartStrategyMessage>;
