import type { Guard } from "../guard/guard.types";
import { createSandbox } from "../sandbox/sandbox";
import { PERMISSIVE_SANDBOX_CONFIG } from "../sandbox/sandbox.constants";
import type { ToolContext } from "./tool.types";

/**
 * Create a minimal ToolContext for use in tool unit tests.
 * Accepts `sandbox` or `guard` in overrides for backward-compat.
 * When `sandbox` is provided, extracts `guardFor("test-tool")` from it.
 */
export function makeToolContext(
  overrides?: Partial<Record<string, unknown>> & {
    guard?: Guard;
    sandbox?: unknown;
  },
): ToolContext {
  const defaultSandbox = createSandbox(PERMISSIVE_SANDBOX_CONFIG);
  let guard: Guard;

  if (overrides?.guard) {
    guard = overrides.guard;
    delete overrides.guard;
  } else if (
    overrides?.sandbox &&
    typeof (overrides.sandbox as Record<string, unknown>)?.guardFor ===
      "function"
  ) {
    guard = (
      overrides.sandbox as Record<string, (name: string) => Guard>
    ).guardFor("test-tool");
    delete overrides.sandbox;
  } else {
    guard = defaultSandbox.guardFor("test-tool");
  }

  const { sandbox: _s, ...rest } = overrides ?? {};
  return {
    agentName: "test-agent",
    abort: AbortSignal.timeout(5_000),
    guard,
    ...rest,
  } as ToolContext;
}
