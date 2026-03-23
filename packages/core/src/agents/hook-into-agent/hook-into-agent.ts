// hookIntoAgent — Append hooks to an existing agent.
//
// Mutates the agent's internal hook store via appendHook (provided by
// createAgent). Returns the same agent reference for chaining.
//
// Supports both AgentHooks (lifecycle) and ToolHooks (tool execution).

import type { Agent } from "../agent/agent.types";
import type { AgentHooks, ToolHooks } from "../hooks/hooks";

// hookIntoAgent

/**
 * Append hooks to an existing agent. Mutates the agent in-place and
 * returns the same reference for chaining.
 *
 * Accepts both agent lifecycle hooks (`AgentHooks`) and tool execution
 * hooks (`ToolHooks`). All hooks are appended to the agent's mutable
 * internal store, so they take effect on subsequent calls.
 *
 * The agent must have been created by `createAgent()` (which provides
 * the internal `appendHook` method). Throws if the agent doesn't support it.
 *
 * @param agent - An agent created by `createAgent()`.
 * @param hooks - Agent lifecycle and/or tool hooks to append.
 * @returns The same agent reference.
 *
 * @example
 * ```ts
 * const agent = createAgent({ name: "llm", model: openai("gpt-4o") });
 *
 * hookIntoAgent(agent, {
 *   beforeCall: [async (msg) => console.log("calling with:", msg)],
 *   alterResponse: [async (text) => text.toUpperCase()],
 *   beforeToolCall: [async ({ name, args }) => console.log(`tool: ${name}`)],
 * });
 *
 * const result = await agent.call("hello");
 * ```
 */
export function hookIntoAgent(agent: Agent, hooks: AgentHooks & ToolHooks): Agent {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- appendHook is an implementation detail, not on the interface
  const appendHook = (agent as any).appendHook as
    | ((hookName: string, callback: unknown) => void)
    | undefined;

  if (!appendHook) {
    throw new Error(
      `hookIntoAgent requires an agent created by createAgent(). ` +
        `Agent "${agent.name}" does not support appendHook.`,
    );
  }

  for (const [name, callbacks] of Object.entries(hooks)) {
    if (callbacks) {
      for (const cb of callbacks as readonly unknown[]) {
        appendHook(name, cb);
      }
    }
  }

  return agent;
}
