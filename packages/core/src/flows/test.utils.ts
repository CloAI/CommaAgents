// Shared test helpers for flow tests.
//
// Provides common agent factories used across all flow test files.

import { createAbortablePromise } from "../abortable/abortable";
import type { AbortablePromise } from "../abortable/abortable.types";
import type { Agent, AgentCallResult } from "../agents/agent/agent.types";

// makeAgent — configurable mock agent

/**
 * Create a mock agent that returns a fixed or dynamic response.
 *
 * @param name - Agent name.
 * @param response - Fixed string or function that receives the input message.
 * @param tokens - Optional token counts (default: promptTokens=1, completionTokens=2).
 */
export function makeAgent(
  name: string,
  response: string | ((msg: string) => string),
  tokens: { promptTokens: number; completionTokens: number } = {
    promptTokens: 1,
    completionTokens: 2,
  },
): Agent {
  return {
    name,
    call(message: string): AbortablePromise<AgentCallResult> {
      return createAbortablePromise(async () => {
        const text =
          typeof response === "function" ? response(message) : response;
        return {
          text,
          usage: tokens,
          finishReason: "stop",
          responseMessages: [],
          steps: [],
        };
      });
    },
    reset(): void {},
  };
}

// makeFailingAgent — throws on call

/**
 * Create a mock agent that throws the given error on every call.
 */
export function makeFailingAgent(name: string, error: Error): Agent {
  return {
    name,
    call(_message: string): AbortablePromise<AgentCallResult> {
      return createAbortablePromise(async () => {
        throw error;
      });
    },
    reset(): void {},
  };
}

// makeCountingAgent — tracks call count

/**
 * Create a mock agent that counts invocations and appends `[name:N]` to the message.
 *
 * Returns the agent and a `getCount()` accessor.
 */
export function makeCountingAgent(name: string): {
  agent: Agent;
  getCount: () => number;
} {
  let count = 0;
  const agent: Agent = {
    name,
    call(message: string): AbortablePromise<AgentCallResult> {
      return createAbortablePromise(async () => {
        count++;
        return {
          text: `${message}[${name}:${count}]`,
          usage: { promptTokens: 1, completionTokens: 1 },
          finishReason: "stop",
          responseMessages: [],
          steps: [],
        };
      });
    },
    reset(): void {
      count = 0;
    },
  };
  return { agent, getCount: () => count };
}
