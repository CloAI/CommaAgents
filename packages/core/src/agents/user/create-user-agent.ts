// createUserAgent — factory function for human-in-the-loop agents.
//
// No class needed. Returns an Agent backed by closure state.
// Uses withAgentHooks() for the shared hook lifecycle.

import type { AgentHooks } from "../../hooks/types";
import { withAgentHooks } from "../hooks";
import type { Agent, AgentCallResult } from "../types";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

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
  /** AbortSignal for cancellation. */
  readonly abort?: AbortSignal;
}

// ---------------------------------------------------------------------------
// Default input collector — uses Bun/Node prompt (stdin)
// ---------------------------------------------------------------------------

const defaultInputCollector: InputCollector = async (request: InputRequest): Promise<string> => {
  // In Bun, `prompt()` is a global that reads from stdin
  if (typeof globalThis.prompt === "function") {
    return globalThis.prompt(request.prompt) ?? "";
  }

  // Fallback: use Node.js readline
  const { createInterface } = await import("node:readline");
  const rl = createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise<string>((resolve, reject) => {
    // Support cancellation via AbortSignal
    if (request.signal?.aborted) {
      rl.close();
      reject(new DOMException("Input collection aborted", "AbortError"));
      return;
    }

    const onAbort = (): void => {
      rl.close();
      reject(new DOMException("Input collection aborted", "AbortError"));
    };

    request.signal?.addEventListener("abort", onAbort, { once: true });

    rl.question(`${request.prompt}\n> `, (answer) => {
      request.signal?.removeEventListener("abort", onAbort);
      rl.close();
      resolve(answer);
    });
  });
};

// ---------------------------------------------------------------------------
// createUserAgent
// ---------------------------------------------------------------------------

/**
 * Create a human-in-the-loop agent.
 *
 * Returns an `Agent` that collects input from the user (or returns a preset
 * message) instead of calling an LLM. Uses the same hook lifecycle as
 * LLM-backed agents via `withAgentHooks()`.
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
  let firstCall = true;

  const requireInput = config.requireInput ?? true;
  const collector = config.inputCollector ?? defaultInputCollector;

  // Core execute function — wrapped by withAgentHooks
  const execute = async (message: string): Promise<AgentCallResult> => {
    let response: string;

    if (requireInput) {
      response = await collector({
        agentName: config.name,
        prompt: message,
        signal: config.abort,
      });
    } else {
      response = config.presetMessage ?? message;
    }

    return {
      text: response,
      steps: [],
      usage: { promptTokens: 0, completionTokens: 0 },
      finishReason: "stop",
    };
  };

  const hookedCall = withAgentHooks(config.hooks, execute);

  return {
    name: config.name,

    async call(message: string): Promise<AgentCallResult> {
      const isFirst = firstCall;
      if (isFirst) {
        firstCall = false;
      }
      const { result } = await hookedCall(message, isFirst);
      return result;
    },

    reset(): void {
      firstCall = true;
    },
  };
}
