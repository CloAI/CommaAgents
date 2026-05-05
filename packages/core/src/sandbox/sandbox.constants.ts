import type { SandboxConfig } from "./sandbox.types";

/**
 * Default sandbox config — permissive, unjailed.
 * Applied when no sandbox is provided to createAgent or the strategy loader.
 * This preserves existing behavior for callers that haven't opted into sandboxing.
 */
export const PERMISSIVE_SANDBOX_CONFIG: SandboxConfig = {
  jail: false,
  read: { default: "allow" },
  write: { default: "allow" },
} as const;

/**
 * Recommended default config for strategies that want basic sandbox discipline.
 * Jailed to cwd, all operations allowed within that boundary.
 * Use this when the cwd is explicitly set to a known project root.
 */
export const DEFAULT_SANDBOX_CONFIG: SandboxConfig = {
  jail: true,
  read: { default: "allow" },
  write: { default: "allow" },
} as const;
