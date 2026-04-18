// hookIntoAgent — Append hooks to an existing agent.
//
// Mutates the agent's internal hook store via appendHook (provided by
// createAgent). Returns void — use separate calls to attach multiple
// hook sets.
//
// Supports both AgentHooks (lifecycle) and ToolHooks (tool execution).

import type { Agent } from "../agent/agent.types";
import type { AgentHooks, ToolHooks } from "../hooks";

// hookIntoAgent

/**
 * Append hooks to an existing agent. Mutates the agent in-place.
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
 *
 * @example
 * ```ts
 * const agent = createAgent({ name: "llm", model: "openai/gpt-4o" });
 *
 * hookIntoAgent(agent, {
 *   beforeCall: [async (message) => console.log("calling with:", message)],
 *   alterResponse: [async (text) => text.toUpperCase()],
 *   beforeToolCall: [async ({ name, args }) => console.log(`tool: ${name}`)],
 * });
 *
 * const result = await agent.call("hello");
 * ```
 */
export function hookIntoAgent(agent: Agent, hooks: AgentHooks & ToolHooks): void {
  if (!agent.appendHook) {
    throw new Error(
      `hookIntoAgent requires an agent created by createAgent(). ` +
        `Agent "${agent.name}" does not support appendHook.`,
    );
  }

  for (const [name, callbacks] of Object.entries(hooks)) {
    if (callbacks) {
      for (const hookCallback of callbacks) {
        agent.appendHook(name, hookCallback);
      }
    }
  }
}
