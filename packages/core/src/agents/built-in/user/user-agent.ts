// UserAgent — human-in-the-loop agent.
//
// Delegates to createAgent with a custom `execute` override that collects
// input from the user (interactive or preset) instead of calling an LLM.

import { createAgent } from "../../agent/agent";
import type { Agent } from "../../agent/agent.types";
import type { InputCollector, UserAgentConfig } from "./user-agent.types";
import { defaultInputCollector } from "./user-agent.utils";

// Re-export types so existing deep imports continue to work.
export type {
  InputCollector,
  InputRequest,
  UserAgentConfig,
} from "./user-agent.types";

// createUserAgent

/**
 * Create a human-in-the-loop agent.
 *
 * Returns an Agent that collects input from the user (or returns a preset
 * message) instead of calling an LLM. Supports the full hook lifecycle
 * by delegating to `createAgent` with a custom `execute` override.
 *
 * @example
 * ```ts
 * import { createUserAgent } from "@comma-agents/core";
 *
 * // Interactive — prompts user for input
 * const interactive = createUserAgent({
 *   name: "user",
 *   requireInput: true,
 * });
 *
 * // Preset — always returns the same message
 * const preset = createUserAgent({
 *   name: "user",
 *   requireInput: false,
 *   presetMessage: "Please review the code above.",
 * });
 *
 * // Both satisfy the Agent interface — usable in any flow
 * const result = await interactive.call("What should we do next?");
 * ```
 */
export function createUserAgent(config: UserAgentConfig): Agent {
  const requireInput = config.requireInput ?? true;
  const collector: InputCollector =
    config.inputCollector ?? defaultInputCollector;

  const agent = createAgent({
    name: config.name,
    execute: async (message: string): Promise<string> => {
      if (requireInput && message === "") {
        return collector({
          agentName: config.name,
          prompt: message,
        });
      }
      return config.presetMessage ?? message;
    },
  });

  return agent;
}
