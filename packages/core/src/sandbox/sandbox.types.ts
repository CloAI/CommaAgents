import type { Guard, Policy } from "../guard/guard.types";
import type { SandboxDeletionMetadata } from "../tools/built-in/delete-file/deletion";

/**
 * Decision mode for a path or operation.
 * - `"allow"` — permit immediately.
 * - `"deny"`  — reject immediately with a SandboxViolationError.
 * - `"ask"`   — delegate to the PermissionRequester; throws if none is configured.
 */
export type AccessMode = "allow" | "deny" | "ask";

/**
 * Policy applied to a class of file-system operations (read or write).
 *
 * Evaluation order: deny patterns → allow patterns → default.
 * Patterns are glob expressions relative to the sandbox `cwd`.
 */
export interface PathPolicy {
  /** Decision when no pattern matches. */
  readonly default: AccessMode;
  /** Glob patterns (relative to cwd) that are explicitly allowed. */
  readonly allow?: readonly string[];
  /** Glob patterns (relative to cwd) that are explicitly denied. Deny wins over allow when both match. */
  readonly deny?: readonly string[];
}

/** Options used to create a sandbox. */
export interface SandboxOptions {
  /** Absolute path used as the root for relative-path resolution. */
  readonly cwd: string;
  /**
   * Decision applied when a resolved path is outside `cwd`.
   * @default "deny"
   */
  readonly outsideWorkspace?: AccessMode;
  /**
   * Whether tools may submit absolute paths.
   * @default "deny"
   */
  readonly absolutePaths?: "allow" | "deny";
  /**
   * Cwd-relative glob patterns that are unconditionally denied for both
   * read and write operations. Evaluated before `read` / `write` policies;
   * cannot be overridden by `allow` patterns or session decisions.
   */
  readonly forbiddenGlobs?: readonly string[];
  /** Read-access policy applied to every FS read operation. @default { default: "allow" } */
  readonly read?: PathPolicy;
  /** Write-access policy applied to every FS write operation. @default { default: "allow" } */
  readonly write?: PathPolicy;
  /** Metadata for trash archive identification (runId, sessionId). Injected by the daemon executor. */
  readonly deletionMetadata?: SandboxDeletionMetadata;
}

/** Access operation evaluated by a tool guard. */
export type AccessOperation = "fs.read" | "fs.write" | "command.execute";

/**
 * The decision returned by a PermissionRequester.
 * - `"allow"` / `"deny"` — one-shot for this invocation only.
 * - `"allow-session"` / `"deny-session"` — remembered for the lifetime
 *   of this guard's session memory (stored in-memory, not persisted to disk).
 */
export type PermissionDecision =
  | "allow"
  | "deny"
  | "allow-session"
  | "deny-session";

/**
 * Data passed to a PermissionRequester when policy resolves to `"ask"`.
 */
export interface PermissionRequest {
  readonly agentName: string;
  readonly toolName?: string;
  readonly operation: AccessOperation;
  readonly resource: string;
  readonly reason: "policy-ask";
  readonly details?: Readonly<Record<string, unknown>>;
  readonly signal?: AbortSignal;
}

/**
 * Async function that presents a permission request to a human (or policy
 * engine) and returns the decision.
 *
 * If the function throws or rejects, the guard treats it as `"deny"`.
 */
export type PermissionRequester = (
  request: PermissionRequest,
) => Promise<PermissionDecision>;

/**
 * A partial update to a guard's in-memory policy.
 * Applied by the daemon's `update_policy` message.
 */
export interface PolicyPatch {
  readonly mode: "read" | "write";
  readonly allow?: readonly string[];
  readonly deny?: readonly string[];
  readonly default?: AccessMode;
}

/**
 * Thin guard registry. Creates per-tool Guard instances lazily.
 * Tools access their guard directly via `ToolContext.guard`.
 */
export interface Sandbox {
  /** The resolved absolute working directory. */
  readonly cwd: string;
  /** Get or lazily create a guard for the given tool. Accepts optional tool-level policies. */
  guardFor(toolName: string, toolPolicies?: readonly Policy[]): Guard;
  /** Apply a read or write policy update to one tool or every tool. */
  updatePolicy(patch: PolicyPatch, toolName?: string): void;
}
