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
  /**
   * Decision when no pattern matches.
   * @default "allow"
   */
  readonly default: AccessMode;
  /** Glob patterns (relative to cwd) that are explicitly allowed. */
  readonly allow?: readonly string[];
  /**
   * Glob patterns (relative to cwd) that are explicitly denied.
   * Deny wins over allow when both match.
   */
  readonly deny?: readonly string[];
}

/**
 * Static configuration for a Sandbox instance.
 */
export interface SandboxConfig {
  /**
   * Absolute path used as the root for relative-path resolution and
   * (when `jail` is true) the boundary tools cannot escape.
   * @default process.cwd()
   */
  readonly cwd?: string;
  /**
   * Read-access policy applied to every FS read operation.
   * @default { default: "allow" }
   */
  readonly read?: PathPolicy;
  /**
   * Write-access policy applied to every FS write operation.
   * @default { default: "allow" }
   */
  readonly write?: PathPolicy;
  /**
   * When `true`, any path that resolves outside `cwd` throws a
   * SandboxViolationError with `reason: "jail"`.
   * @default false
   */
  readonly jail?: boolean;
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
 *   of this Sandbox instance (stored in-memory, not persisted to disk).
 */
export type PermissionDecision = "allow" | "deny" | "allow-session" | "deny-session";

/**
 * Data passed to a PermissionRequester when policy resolves to `"ask"`.
 */
export interface PermissionRequest {
  /** Name of the agent that triggered the operation. */
  readonly agentName: string;
  /** Name of the tool that triggered the operation, if known. */
  readonly toolName?: string;
  /** Category of the operation being requested. */
  readonly operation: PermissionOperation;
  /** Resolved absolute path (or other resource identifier) being accessed. */
  readonly resource: string;
  /**
   * Why this request is being raised.
   * - `"policy-ask"` — the policy for this path is set to `"ask"`.
   * - `"policy-deny-override"` — user previously chose `"deny-session"` but
   *   the tool is attempting to request a one-time override.
   */
  readonly reason: "policy-ask" | "policy-deny-override";
  /** Optional extra context for the UI (e.g. the content about to be written). */
  readonly details?: Readonly<Record<string, unknown>>;
  /**
   * AbortSignal from the invoking tool. The PermissionRequester should race
   * against this signal so that aborting the run cancels any pending prompt.
   */
  readonly signal?: AbortSignal;
}

/**
 * Async function that presents a permission request to a human (or policy
 * engine) and returns the decision.
 *
 * If the function throws or rejects, the sandbox treats it as `"deny"`.
 */
export type PermissionRequester = (request: PermissionRequest) => Promise<PermissionDecision>;

// Sandbox instance types

/**
 * Context forwarded by a tool when it calls the sandbox authorization methods.
 */
export interface AuthorizationContext {
  /** Name of the invoking agent. */
  readonly agentName: string;
  /** Name of the invoking tool. */
  readonly toolName: string;
  /** AbortSignal from the tool's ToolContext. */
  readonly signal: AbortSignal;
}

/**
 * A partial update to a sandbox's in-memory read or write policy.
 * Applied by `Sandbox.updatePolicy()` and by the daemon's `update_policy` message.
 */
export interface PolicyPatch {
  /** Which policy dimension to update. */
  readonly mode: "read" | "write";
  /**
   * Additional glob patterns to add to the allow list.
   * Patterns are appended; existing ones are preserved.
   */
  readonly allow?: readonly string[];
  /**
   * Additional glob patterns to add to the deny list.
   * Patterns are appended; existing ones are preserved.
   */
  readonly deny?: readonly string[];
  /** Replace the default decision for this dimension. */
  readonly default?: AccessMode;
}

/**
 * Snapshot of the current in-memory policy (read + write) returned by
 * `Sandbox.getPolicy()`. Reflects any runtime mutations via `updatePolicy()`.
 */
export interface PolicySnapshot {
  readonly read: PathPolicy;
  readonly write: PathPolicy;
}

/**
 * Listener invoked whenever `Sandbox.updatePolicy()` mutates state.
 */
export type PolicyChangeListener = (snapshot: PolicySnapshot) => void;

/**
 * The runtime sandbox object. Wraps a strategy's execution environment
 * with a declared working directory and read/write policies.
 *
 * Obtain an instance via `createSandbox()`.
 */
export interface Sandbox {
  /** The resolved absolute working directory for this sandbox. */
  readonly cwd: string;

  // Synchronous path resolution (no I/O, no policy check)

  /**
   * Resolve `path` against `cwd` and, when `jail` is enabled, assert it
   * remains inside the jail. Returns the resolved absolute path.
   *
   * @throws {SandboxViolationError} with `reason: "jail"` if the resolved
   * path escapes the sandbox cwd when `jail: true`.
   */
  resolvePath(path: string): string;

  // Synchronous policy inspection (non-throwing)

  /**
   * Return `true` if the read policy would allow this path (without asking).
   * Does not throw; useful for filtering (e.g., glob/grep output).
   */
  canRead(path: string): boolean;

  /**
   * Return `true` if the write policy would allow this path (without asking).
   * Does not throw.
   */
  canWrite(path: string): boolean;

  // Synchronous enforcement (throws on deny)

  /**
   * Assert the path is readable. Throws for `"deny"`; returns the resolved
   * absolute path for `"allow"`. Does **not** trigger `"ask"` — use
   * `authorizeRead` when interactive prompting is needed.
   *
   * @throws {SandboxViolationError} with `reason: "jail"` or `"read-denied"`.
   */
  assertReadable(path: string): string;

  /**
   * Assert the path is writable. Throws for `"deny"`; returns the resolved
   * absolute path for `"allow"`. Does **not** trigger `"ask"`.
   *
   * @throws {SandboxViolationError} with `reason: "jail"` or `"write-denied"`.
   */
  assertWritable(path: string): string;

  // Async authorization (may prompt the user for "ask" decisions)

  /**
   * Authorize a read operation. Resolves to the absolute path if permitted.
   * When the policy resolves to `"ask"`, calls `PermissionRequester` and
   * applies the decision (including session-level memory).
   *
   * @throws {SandboxViolationError} if denied or if `"ask"` fires with no
   *   PermissionRequester configured.
   */
  authorizeRead(path: string, authorizationContext: AuthorizationContext): Promise<string>;

  /**
   * Authorize a write operation. Resolves to the absolute path if permitted.
   *
   * @throws {SandboxViolationError} if denied or if `"ask"` fires with no
   *   PermissionRequester configured.
   */
  authorizeWrite(path: string, authorizationContext: AuthorizationContext): Promise<string>;

  // Runtime policy mutation

  /**
   * Apply a partial policy update, mutating in-memory state.
   * Fires all `onPolicyChange` listeners after the update.
   *
   * Used for `"allow-session"` / `"deny-session"` decisions and for
   * the daemon's `update_policy` message.
   */
  updatePolicy(patch: PolicyPatch): void;

  /**
   * Return a snapshot of the current in-memory read and write policies.
   * Reflects any mutations applied via `updatePolicy()`.
   */
  getPolicy(): PolicySnapshot;

  /**
   * Subscribe to policy mutations. The listener is called synchronously
   * after every `updatePolicy()` call.
   *
   * @returns An unsubscribe function.
   */
  onPolicyChange(listener: PolicyChangeListener): () => void;
}

/**
 * Dependencies injected into a Sandbox at creation time.
 */
export interface SandboxDependencies {
  /**
   * Called when policy resolves to `"ask"`.
   * If absent and a path resolves to `"ask"`, a SandboxViolationError
   * with `reason: "ask-no-handler"` is thrown.
   */
  readonly requestPermission?: PermissionRequester;
}
