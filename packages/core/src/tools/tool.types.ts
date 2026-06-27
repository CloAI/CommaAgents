import type { z } from "zod";
import type { InputCollector } from "../agents/built-in/user/user-agent.types";
import type { Guard, Policy } from "../guard/guard.types";
import type { LanguageService } from "../language";
import type { SkillRegistry } from "../skills/skills.types";
import type { AuditSink } from "./io/audit.types";
import type { LaunchStrategyHandle } from "./launch-strategy.types";

/**
 * Context passed to tool execute functions.
 * Provides the calling agent's identity, its per-tool Guard for
 * file-system and command authorization, cancellation support,
 * and optional session/audit/skill state.
 */
export interface ToolContext {
  /** Name of the agent that invoked this tool. */
  readonly agentName: string;
  /** Name of the flow currently executing, when invoked within one. */
  readonly flowName?: string;
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
   *
   * Sessions are a broader concept than runs — one user/daemon session
   * typically spans many strategy runs and is the unit of audit-log
   * grouping and trash-archive identification. For per-run isolation
   * (notably `todo_*` silos across recursive `launch_strategy` calls),
   * use {@link runId} instead.
   */
  readonly sessionId?: string;
  /**
   * Optional run identifier — one strategy invocation. The daemon
   * supplies the top-level run's id at the entry point and a *fresh*
   * derived id for each `launch_strategy` sub-load, so recursive
   * sub-strategies get isolated state for tools that key on `runId`.
   *
   * Distinct from {@link sessionId}: sessionId groups many runs (audit,
   * trash); runId identifies a single run. Tools that need per-run shared
   * state with per-launch isolation (e.g., `todo_*`) silo on `runId`.
   */
  readonly runId?: string;
  /**
   * Optional audit sink for destructive file operations.
   */
  readonly auditSink?: AuditSink;
  /**
   * Optional skill registry exposed to the `load_skill` tool.
   */
  readonly skillRegistry?: SkillRegistry;
  /**
   * Optional input collector forwarded from the parent strategy.
   *
   * Tools that spawn sub-strategies (e.g., `launch_strategy`) pass this
   * to `loadStrategyFromString` so any `user` agents in the child can
   * prompt through the same UI as the parent run.
   */
  readonly inputCollector?: InputCollector;
  /**
   * Optional handle for spawning a sub-strategy.
   *
   * When provided by the runtime (e.g., the daemon executor), tools
   * such as `launch_strategy` delegate to this handle instead of
   * calling `loadStrategy` directly, so flow / agent hooks and
   * broadcast wiring are reused for the nested run.
   */
  readonly launchStrategy?: LaunchStrategyHandle;
  /**
   * Optional runtime language service.
   *
   * Core defines the stable contract and language tools; runtimes such as the
   * daemon provide concrete implementations (TypeScript today, more language
   * adapters later).
   */
  readonly languageService?: LanguageService;
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
  | "language_unavailable"
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
 * Optionally, tools can contribute to the agent's system prompt via
 * the `systemPrompt` field. This is useful when a tool needs to inject
 * complex context or instructions that should be visible to the LLM.
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
  /**
   * Optional system prompt contribution from this tool.
   *
   * When provided, this content is injected ONCE into the agent's system
   * prompt at agent creation time (not per-call). This allows tools to
   * define complex context, instructions, or formatting requirements that
   * the LLM should know about.
   *
   * Can be a static string or a function that receives the ToolContext
   * and returns a string (sync or async). The function form is useful
   * when the prompt depends on runtime state (e.g., current workspace).
   *
   * @example
   * ```ts
   * // Static prompt
   * defineTool({
   *   systemPrompt: "When using this tool, always format output as JSON.",
   *   // ...
   * })
   *
   * // Dynamic prompt (function)
   * defineTool({
   *   systemPrompt: async (toolContext) => {
   *     return `Working directory: ${toolContext.guard.cwd}`;
   *   },
   *   // ...
   * })
   * ```
   */
  readonly systemPrompt?:
    | string
    | ((toolContext: ToolContext) => Promise<string> | string);
  /** Execute the tool with validated arguments and context. */
  execute(
    validatedArguments: z.infer<ParameterSchema>,
    toolContext: ToolContext,
  ): Promise<ToolResult<DataShape>>;
}
