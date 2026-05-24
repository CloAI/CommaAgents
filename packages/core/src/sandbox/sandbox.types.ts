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
 * Patterns are Bun.Glob expressions relative to the sandbox `cwd`.
 */
export interface PathPolicy {
  /** Decision when no pattern matches. */
  readonly default: AccessMode;
  /** Glob patterns (relative to cwd) that are explicitly allowed. */
  readonly allow?: readonly string[];
  /** Glob patterns (relative to cwd) that are explicitly denied. Deny wins over allow when both match. */
  readonly deny?: readonly string[];
}

/**
 * Static configuration for a Sandbox instance.
 */
export interface SandboxConfig {
  /** Absolute path used as the root for relative-path resolution and jail boundary. */
  readonly cwd: string;
  /**
   * When `true`, any path that resolves outside `cwd` throws a
   * SandboxViolationError with `reason: "jail"`.
   */
  readonly jail: boolean;
  /**
   * When `false`, tools that pass an absolute path receive a
   * SandboxViolationError with `reason: "absolute-path"`.
   */
  readonly allowAbsolutePaths: boolean;
  /**
   * Cwd-relative glob patterns that are unconditionally denied for both
   * read and write operations. Evaluated before `read` / `write` policies;
   * cannot be overridden by `allow` patterns or session decisions.
   */
  readonly forbiddenGlobs: readonly string[];
  /** Read-access policy applied to every FS read operation. */
  readonly read: PathPolicy;
  /** Write-access policy applied to every FS write operation. */
  readonly write: PathPolicy;
  /** Metadata for trash archive identification (runId, sessionId). Injected by the daemon executor. */
  readonly trashMetadata?: SandboxTrashMetadata;
}

// Permission request / response types

/**
 * File-system operation categories used in permission requests.
 * `"fs.exec"` is reserved for future bash sandboxing.
 */
export type PermissionOperation = "fs.read" | "fs.write" | "fs.exec";

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
  readonly operation: PermissionOperation;
  readonly resource: string;
  readonly reason: "policy-ask" | "policy-deny-override";
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

// Sandbox — thin wrapper

import type { Guard, Policy } from "../guard/guard.types";
import type { SandboxTrashMetadata } from "../tools/io/trash";

/**
 * Thin guard registry. Creates per-tool Guard instances lazily.
 * Tools access their guard directly via `ToolContext.guard`.
 */
export interface Sandbox {
  /** The resolved absolute working directory. */
  readonly cwd: string;
  /** Map of tool name → Guard (lazily populated). */
  readonly guards: ReadonlyMap<string, Guard>;
  /** Get or lazily create a guard for the given tool. Accepts optional tool-level policies. */
  guardFor(toolName: string, toolPolicies?: readonly Policy[]): Guard;
}
