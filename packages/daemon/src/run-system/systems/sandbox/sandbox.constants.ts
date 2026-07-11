import {
  DEFAULT_FORBIDDEN_GLOBS,
  type SandboxOptions,
} from "@comma-agents/core/sandbox";

export const DAEMON_SANDBOX_OPTIONS: Omit<SandboxOptions, "cwd"> = {
  outsideWorkspace: "ask",
  absolutePaths: "allow",
  forbiddenGlobs: DEFAULT_FORBIDDEN_GLOBS,
  read: { default: "allow", allow: ["**", ".", ".comma/**"] },
  write: { default: "allow", allow: ["**"] },
};
