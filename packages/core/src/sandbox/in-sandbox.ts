import type { Agent } from "../agents/agent/agent.types";
import type { GuardCallbacks } from "../guard/guard.types";
import { createSandbox } from "./sandbox";
import type { Sandbox, SandboxConfig } from "./sandbox.types";

const SANDBOX_KEY = Symbol("comma-agents.sandbox");

function setSandboxOnAgent(agent: Agent, sandbox: Sandbox): void {
  (agent as Record<symbol, Sandbox>)[SANDBOX_KEY] = sandbox;
  // Also mutate config so buildCallOptions reads it via config.sandbox
  if (agent.config) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (agent.config as any).sandbox = sandbox;
  }
}

/**
 * Apply sandbox enforcement to a strategy or agent.
 *
 * Creates a `Sandbox` from the config, which lazily creates per-tool `Guard`
 * instances. Tools access their guard directly via `ToolContext.guard` and
 * call `guard.authorize()` for path resolution, jail enforcement, policy
 * evaluation, and interactive "ask" dispatch.
 *
 * @param boxed - The strategy or agent to sandbox.
 * @param config - Partial sandbox configuration. Defaults are taken from
 *   `DEFAULT_SANDBOX_CONFIG` (jailed to process.cwd(), default forbidden globs).
 * @param callbacks - onAsk / onPolicyChange handlers shared across all guards.
 * @returns The same entity (mutated in-place).
 */
export function inSandbox(
  boxed: Agent,
  config?: Partial<SandboxConfig>,
  callbacks?: GuardCallbacks,
): Agent;
export function inSandbox(
  boxed: { agents: Readonly<Record<string, Agent>>; flow: Agent },
  config?: Partial<SandboxConfig>,
  callbacks?: GuardCallbacks,
): typeof boxed;
export function inSandbox(
  boxed: Agent | { agents: Readonly<Record<string, Agent>>; flow: Agent },
  config: Partial<SandboxConfig> = {},
  callbacks?: GuardCallbacks,
): typeof boxed {
  const sandbox = createSandbox(config, callbacks);

  if ("agents" in boxed && "flow" in boxed) {
    for (const agent of Object.values(boxed.agents)) {
      setSandboxOnAgent(agent, sandbox);
    }
  } else {
    setSandboxOnAgent(boxed as Agent, sandbox);
  }

  return boxed;
}

/**
 * Retrieve the `Sandbox` instance from a previously sandboxed entity.
 *
 * Returns `undefined` if `inSandbox` was never called on this entity.
 * Useful for the daemon to access `sandbox.guardFor(tool)` for policy management.
 */
export function getSandbox(
  boxed: Agent | { agents: Readonly<Record<string, Agent>> },
): Sandbox | undefined {
  return (boxed as Record<symbol, Sandbox>)[SANDBOX_KEY];
}
