import type { z } from "zod";
import type { Guard, Policy } from "../guard/guard.types";
import type { SkillRegistry } from "../skills/skills.types";
import type { AuditSink } from "./io/audit";

/**
 * Context passed to tool execute functions.
 * Provides the calling agent's identity, its per-tool Guard for
 * file-system and command authorization, cancellation support,
 * and optional session/audit/skill state.
 */
export interface ToolContext {
  /** Name of the agent that invoked this tool. */
  readonly agentName: string;
  /** AbortSignal for cancellation propagation. */
  readonly abort: AbortSignal;
  /**
   * Per-tool guard that handles path resolution, jail enforcement,
   * policy chain evaluation, and interactive "ask" dispatch.
   * Always present — defaults to a permissive guard when none is configured.
   */
  readonly guard: Guard;
  /**
   * Optional session identifier. When present, mutations are written to a
   * session-scoped audit log and `SessionFileState` can be reconstructed
   * across runtime restarts.
   */
  readonly sessionId?: string;
  /**
   * Optional audit sink for destructive file operations.
   */
  readonly auditSink?: AuditSink;
  /**
   * Optional skill registry exposed to the `load_skill` tool.
   */
  readonly skillRegistry?: SkillRegistry;
}

/**
 * Closed enumeration of error kinds emitted by built-in tools.
 *
 * The set is fixed so callers (LLMs and orchestration code) can switch on
 * `kind` without parsing free-form messages. New kinds are added here
 * deliberately and never derived from underlying error strings.
 */
export type ToolErrorKind =
  | "not_found"
  | "already_exists"
  | "permission_denied"
  | "outside_workspace"
  | "binary_file"
  | "file_too_large"
  | "stale_file"
  | "old_text_not_found"
  | "multiple_matches"
  | "overlapping_edits"
  | "patch_parse_error"
  | "patch_apply_error"
  | "command_failed"
  | "timeout"
  | "skill_unavailable"
  | "unknown";

/**
 * Structured error returned by a tool when an operation cannot complete.
 *
 * Tools must populate `recoverable` and (when recoverable) `suggestedNextAction`
 * so the calling LLM can self-correct without escalating to the user.
 */
export interface ToolError {
  /** Stable machine-readable error category. */
  readonly kind: ToolErrorKind;
  /** Human-readable description of what went wrong. */
  readonly message: string;
  /** Resolved path the error refers to, when applicable. */
  readonly path?: string;
  /** Free-form structured detail (match ranges, conflict indices, etc.). */
  readonly details?: Readonly<Record<string, unknown>>;
  /** Whether the LLM can plausibly retry after applying `suggestedNextAction`. */
  readonly recoverable: boolean;
  /** When `recoverable`, a concrete instruction for the LLM's next call. */
  readonly suggestedNextAction?: string;
}

/**
 * Result returned from a tool execution.
 *
 * The shape is dual-purpose:
 * - `output` and `metadata` remain the LLM-facing surface: `output` is the
 *   text returned to the model and `metadata` is opaque side-channel data
 *   for serializers and hooks.
 * - `ok`, `error`, and `data` are the structured surface used by tests,
 *   the daemon, and any code that needs to inspect the outcome without
 *   parsing strings.
 *
 * `ok` is the source of truth for success/failure. When `ok` is `false`,
 * `error` MUST be set. When `ok` is `true`, `error` MUST be undefined.
 */
export interface ToolResult<DataShape = unknown> {
  /** Whether the tool completed successfully. */
  readonly ok: boolean;
  /** The textual output to return to the LLM. */
  readonly output: string;
  /** Structured payload — typed per-tool via the `DataShape` generic. */
  readonly data?: DataShape;
  /** Structured failure information. Required when `ok` is `false`. */
  readonly error?: ToolError;
  /** Optional opaque metadata for hooks and serializers. */
  readonly metadata?: Readonly<Record<string, unknown>>;
}

/**
 * Definition of a tool that an agent can invoke.
 *
 * Tools have a description (for the LLM), Zod-validated parameters,
 * and an async execute function.
 *
 * @typeParam ParameterSchema - Zod schema type for the tool's parameters
 * @typeParam DataShape - Typed payload returned in `ToolResult.data`
 */
export interface ToolDefinition<
  ParameterSchema extends z.ZodType = z.ZodType,
  DataShape = unknown,
> {
  /** Human-readable description of what this tool does (sent to the LLM). */
  readonly description: string;
  /** Zod schema that validates and types the tool's parameters. */
  readonly parameters: ParameterSchema;
  /**
   * Additional policies for this tool (e.g., run_command deny/approval patterns).
   * Added to the tool's Guard policy chain by `createSandbox()`.
   */
  readonly policies?: readonly Policy[];
  /** Execute the tool with validated arguments and context. */
  execute(
    validatedArguments: z.infer<ParameterSchema>,
    toolContext: ToolContext,
  ): Promise<ToolResult<DataShape>>;
}
