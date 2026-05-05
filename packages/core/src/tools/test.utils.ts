import { createSandbox } from "../sandbox/sandbox";
import type { ToolContext } from "./tool.types";

/**
 * Create a minimal ToolContext for use in tool unit tests.
 * Provides a permissive sandbox so tests are not affected by policy restrictions.
 */
export function makeToolContext(overrides?: Partial<ToolContext>): ToolContext {
  return {
    agentName: "test-agent",
    abort: AbortSignal.timeout(5_000),
    sandbox: createSandbox(),
    ...overrides,
  };
}
