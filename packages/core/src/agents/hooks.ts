// Agent hook lifecycle middleware.
//
// The hook lifecycle (alter message → before → execute → after → alter response)
// is shared across all agent types. This module implements it once as a
// higher-order function that wraps any execute function.

import type { AgentHooks, SideEffectHook, TransformHook } from "../hooks/types";
import { runSideEffectHooks, runTransformHooks } from "../hooks/types";
import type { AgentCallResult, HookedCallResult } from "./types";

// ---------------------------------------------------------------------------
// Hook resolution
// ---------------------------------------------------------------------------

/**
 * Resolve hooks for a given lifecycle point, handling initial vs regular
 * selection with fallback.
 *
 * On the first call (`isFirst = true`), the initial variant is preferred.
 * If not defined, falls back to the regular variant.
 * On subsequent calls, the regular variant is always used.
 */
export function resolveHook<T>(
  initialHooks: ReadonlyArray<T> | undefined,
  regularHooks: ReadonlyArray<T> | undefined,
  isFirst: boolean,
): ReadonlyArray<T> | undefined {
  if (isFirst) {
    return initialHooks ?? regularHooks;
  }
  return regularHooks;
}

// ---------------------------------------------------------------------------
// Individual hook runners (exported for advanced use)
// ---------------------------------------------------------------------------

/** Resolve and run alter-message hooks. */
export async function runAlterMessageHooks(
  hooks: AgentHooks | undefined,
  message: string,
  isFirst: boolean,
): Promise<string> {
  const resolved = resolveHook(hooks?.alterInitialCallMessage, hooks?.alterCallMessage, isFirst);
  return runTransformHooks(resolved, message);
}

/** Resolve and run before-call hooks. */
export async function runBeforeCallHooks(
  hooks: AgentHooks | undefined,
  message: string,
  isFirst: boolean,
): Promise<void> {
  const resolved = resolveHook(hooks?.beforeInitialCall, hooks?.beforeCall, isFirst);
  await runSideEffectHooks(resolved, message);
}

/** Resolve and run after-call hooks. */
export async function runAfterCallHooks(
  hooks: AgentHooks | undefined,
  response: string,
  isFirst: boolean,
): Promise<void> {
  const resolved = resolveHook(hooks?.afterInitialCall, hooks?.afterCall, isFirst);
  await runSideEffectHooks(resolved, response);
}

/** Resolve and run alter-response hooks. */
export async function runAlterResponseHooks(
  hooks: AgentHooks | undefined,
  response: string,
  isFirst: boolean,
): Promise<string> {
  const resolved = resolveHook(hooks?.alterInitialResponse, hooks?.alterResponse, isFirst);
  return runTransformHooks(resolved, response);
}

// ---------------------------------------------------------------------------
// withAgentHooks — the main middleware
// ---------------------------------------------------------------------------

/**
 * Wrap an execute function with the full agent hook lifecycle.
 *
 * Returns a function that, given a message and `isFirst` flag, runs:
 *   alterCallMessage → beforeCall → execute → afterCall → alterResponse
 *
 * The returned `HookedCallResult` includes both the final result and the
 * altered message (so callers like BaseAgent can use it for history).
 *
 * @param hooks - Agent lifecycle hooks (may be undefined for no-op).
 * @param executeFn - The core action (LLM call, user input, etc.).
 * @returns A function `(message, isFirst) => Promise<HookedCallResult>`.
 *
 * @example
 * ```ts
 * const hooked = withAgentHooks(config.hooks, async (msg) => {
 *   // your core logic here
 *   return { text: "response", steps: [], usage: { promptTokens: 0, completionTokens: 0 }, finishReason: "stop" };
 * });
 *
 * const { result, alteredMessage } = await hooked("hello", true);
 * ```
 */
export function withAgentHooks(
  hooks: AgentHooks | undefined,
  executeFn: (message: string) => Promise<AgentCallResult>,
): (message: string, isFirst: boolean) => Promise<HookedCallResult> {
  return async (message: string, isFirst: boolean): Promise<HookedCallResult> => {
    // 1. Alter message
    const alteredMessage = await runAlterMessageHooks(hooks, message, isFirst);

    // 2. Before call
    await runBeforeCallHooks(hooks, alteredMessage, isFirst);

    // 3. Execute core action
    const result = await executeFn(alteredMessage);

    // 4. After call
    await runAfterCallHooks(hooks, result.text, isFirst);

    // 5. Alter response
    const alteredText = await runAlterResponseHooks(hooks, result.text, isFirst);

    return {
      result: { ...result, text: alteredText },
      alteredMessage,
    };
  };
}
