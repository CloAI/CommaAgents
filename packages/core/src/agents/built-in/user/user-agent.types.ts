// User agent configuration and input collection types.

import type { AgentHooks } from "../../hooks";

// InputRequest

/**
 * Context passed to the InputCollector when requesting user input.
 * Richer than a bare string — provides agent identity and cancellation.
 */
export interface InputRequest {
  /** Name of the agent requesting input. */
  readonly agentName: string;
  /** The prompt message to display to the user. */
  readonly prompt: string;
  /** Signal for cancellation (e.g., flow was stopped). */
  readonly signal?: AbortSignal;
}

// InputCollector

/**
 * Function that collects input from the user.
 * The daemon/TUI provides an implementation that bridges to the UI.
 *
 * @example
 * ```ts
 * // Simple CLI collector
 * const collector: InputCollector = async ({ prompt }) => {
 *   return prompt(prompt) ?? "";
 * };
 *
 * // Daemon collector (bridges to WebSocket)
 * const collector: InputCollector = async ({ agentName, prompt, signal }) => {
 *   return wsRequestInput(agentName, prompt, signal);
 * };
 * ```
 */
export type InputCollector = (request: InputRequest) => Promise<string>;

// UserAgentConfig

/** Configuration for creating a user agent. */
export interface UserAgentConfig {
  /** Unique name for this agent. */
  readonly name: string;
  /**
   * When true, the agent calls the inputCollector to get user input.
   * When false, returns `presetMessage` or passes the incoming message through.
   * @default true
   */
  readonly requireInput?: boolean;
  /**
   * A preset message to return when `requireInput` is false.
   * If not set and `requireInput` is false, the incoming message is passed through.
   */
  readonly presetMessage?: string;
  /**
   * Function that collects input from the user.
   * Required when `requireInput` is true.
   * Defaults to reading from stdin via `prompt()`.
   */
  readonly inputCollector?: InputCollector;
  /** Agent lifecycle hooks. */
  readonly hooks?: AgentHooks;
}
