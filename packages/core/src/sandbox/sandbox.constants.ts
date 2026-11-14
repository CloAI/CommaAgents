import type { SandboxOptions } from "./sandbox.types";

/**
 * Cwd-relative glob patterns that are always denied for read and write
 * unless the caller explicitly overrides `forbiddenGlobs` on `SandboxOptions`.
 *
 * Covers VCS metadata, dotenv files, common private keys/certs, and
 * package-manager auth files. Patterns are matched against workspace paths, including dotfiles.
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
 * Permissive options — outside paths and absolute paths allowed, no forbidden globs,
 * all reads and writes allowed.
 *
 * Applied as fallback in `buildAgentToolSet` when no sandbox is provided.
 */
export const PERMISSIVE_SANDBOX_OPTIONS: SandboxOptions = {
  cwd: process.cwd(),
  outsideWorkspace: "allow",
  absolutePaths: "allow",
  forbiddenGlobs: [],
  read: { default: "allow" },
  write: { default: "allow" },
} as const;

/**
 * Recommended default options — outside paths and absolute paths rejected,
 * default forbidden globs enforced, all operations allowed within the boundary.
 * `.comma/**` and `.` are explicitly allowlisted for reading so skills and
 * configuration are always accessible without triggering permission prompts.
 */
export const DEFAULT_SANDBOX_OPTIONS: SandboxOptions = {
  cwd: process.cwd(),
  outsideWorkspace: "deny",
  absolutePaths: "deny",
  forbiddenGlobs: DEFAULT_FORBIDDEN_GLOBS,
  read: { default: "allow", allow: [".", ".comma/**"] },
  write: { default: "allow" },
} as const;
