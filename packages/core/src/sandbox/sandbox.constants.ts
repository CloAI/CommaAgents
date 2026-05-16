import type { SandboxConfig } from "./sandbox.types";

/**
 * Cwd-relative glob patterns that are always denied for read and write
 * unless the caller explicitly overrides `forbiddenGlobs` on `SandboxConfig`.
 *
 * Covers VCS metadata, dotenv files, common private keys/certs, and
 * package-manager auth files. Patterns are evaluated by Bun.Glob.
 */
export const DEFAULT_FORBIDDEN_GLOBS: readonly string[] = [
  ".git/**",
  "**/.env*",
  "**/*.pem",
  "**/*.key",
  "**/id_rsa*",
  "**/secrets/**",
  "**/.npmrc",
  "**/.yarnrc",
  "**/*.crt",
] as const;

/**
 * Permissive config — unjailed, absolute paths allowed, no forbidden globs,
 * all reads and writes allowed.
 *
 * Applied as fallback in `buildAgentToolSet` when no sandbox is configured.
 */
export const PERMISSIVE_SANDBOX_CONFIG: SandboxConfig = {
  cwd: process.cwd(),
  jail: false,
  allowAbsolutePaths: true,
  forbiddenGlobs: [],
  read: { default: "allow" },
  write: { default: "allow" },
} as const;

/**
 * Recommended default config — jailed to cwd, absolute paths rejected,
 * default forbidden globs enforced, all operations allowed within the boundary.
 */
export const DEFAULT_SANDBOX_CONFIG: SandboxConfig = {
  cwd: process.cwd(),
  jail: true,
  allowAbsolutePaths: false,
  forbiddenGlobs: DEFAULT_FORBIDDEN_GLOBS,
  read: { default: "allow" },
  write: { default: "allow" },
} as const;

/**
 * Daemon default config — jailed to cwd, absolute paths allowed (daemon
 * passes absolute paths), in-cwd paths auto-allowed, anything outside
 * cwd triggers "ask" via the permission bridge.
 */
export const DEFAULT_DAEMON_SANDBOX_CONFIG: Omit<SandboxConfig, "cwd"> = {
  jail: true,
  allowAbsolutePaths: true,
  forbiddenGlobs: DEFAULT_FORBIDDEN_GLOBS,
  read: { default: "ask", allow: ["**"] },
  write: { default: "ask", allow: ["**"] },
} as const;
