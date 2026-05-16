import type { PermissionDecision, PermissionOperation } from "../sandbox/sandbox.types";

/** Closed set of access categories that a tool can request. */
export type AccessType = "fs.read" | "fs.write" | "command.execute";

/** Describes what a tool wants to do. Evaluated against the guard's policy chain. */
export interface AccessRequest {
  /** Category of access: file read, file write, or command execution. */
  readonly type: AccessType;
  /** The path, command, or other resource being accessed. */
  readonly resource: string;
}

/** A policy's evaluation result. "pass" means "skip me, let the next policy decide." */
export type PolicyDecision = "allow" | "deny" | "ask" | "pass";

/**
 * Pure evaluation function — stateless, composable, testable.
 * Returns "pass" when the policy doesn't handle this request type.
 */
export interface Policy {
  readonly name: string;
  evaluate(request: AccessRequest): PolicyDecision | Promise<PolicyDecision>;
}

/**
 * Context forwarded by a tool when it calls `guard.authorize()`.
 */
export interface AuthorizationContext {
  readonly agentName: string;
  readonly toolName: string;
  readonly signal: AbortSignal;
}

/**
 * Permission request dispatched to the guard's `onAsk` callback when a
 * policy returns "ask".
 */
export interface GuardPermissionRequest {
  readonly agentName: string;
  readonly toolName: string;
  readonly operation: PermissionOperation | AccessType;
  readonly resource: string;
  readonly reason: "policy-ask";
  readonly signal?: AbortSignal;
}

/** Snapshot of the guard's current policy chain. */
export interface GuardPolicySnapshot {
  readonly toolName: string;
  readonly policies: ReadonlyArray<{ readonly name: string }>;
}

/** Callbacks injected into every guard at creation time. */
/** Callbacks injected into every guard at creation time. */
/** Callbacks injected into every guard at creation time. */
export interface GuardCallbacks {
  /**
   * Called when the policy chain returns "ask". Returns the user's decision.
   * If absent and a policy returns "ask", the guard fails-closed.
   */
  readonly onAsk?: (
    request: GuardPermissionRequest,
  ) => Promise<PermissionDecision>;

  /**
   * Called whenever the guard's policy chain changes (addPolicy/removePolicy
   * or session-memory self-update). The snapshot includes the tool name and
   * the ordered policy chain.
   */
  readonly onPolicyChange?: (snapshot: GuardPolicySnapshot) => void;
}

/**
 * Per-tool enforcement engine.
 *
 * Created lazily by the Sandbox for each tool. Handles path resolution,
 * jail enforcement, policy chain evaluation, "ask" dispatch, and
 * self-updating session memory.
 */
export interface Guard {
  /** The tool this guard enforces. */
  readonly toolName: string;
  /** Workspace root for path resolution. */
  readonly cwd: string;

  /**
   * Full authorization through the policy chain.
   * Resolves the path, checks jail, evaluates policies, dispatches "ask"
   * if needed. Returns the resolved absolute path on success.
   *
   * @throws {SandboxViolationError} on deny, jail escape, or forbidden glob.
   */
  authorize(
    request: AccessRequest,
    ctx: AuthorizationContext,
  ): Promise<string>;

  /**
   * Non-throwing inspection. Returns false when the policy chain would deny.
   * Never dispatches "ask" — treats "ask" the same as "deny".
   */
  canAccess(request: AccessRequest): boolean;

  /** Insert a policy into the chain, optionally before a named policy. */
  addPolicy(policy: Policy, before?: string): void;

  /** Remove a policy by name. Returns true if it was found and removed. */
  removePolicy(name: string): boolean;

  /** Snapshot of the current policy chain for broadcasting. */
  getPolicies(): GuardPolicySnapshot;

  /** Subscribe to policy chain changes. Returns an unsubscribe function. */
  onPolicyChange(
    listener: (snapshot: GuardPolicySnapshot) => void,
  ): () => void;
}
