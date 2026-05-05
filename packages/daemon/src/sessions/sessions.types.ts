import type { RunStatus } from "../state/state.types";

/** Current persisted-session schema version. Bump when the on-disk shape changes. */
export const SESSION_SCHEMA_VERSION = 1;

/**
 * Lightweight metadata describing a saved session.
 *
 * Returned by `list_sessions` so clients can render a picker without
 * loading every full transcript.
 */
export interface SessionMetadata {
  /** Stable session identifier (UUID). Also serves as the default `title`. */
  readonly id: string;
  /** Absolute, normalized cwd (realpath where possible) the session belongs to. */
  readonly cwd: string;
  /** First 16 hex chars of sha256(cwd). Used as the on-disk bucket. */
  readonly cwdHash: string;
  /** Human-readable title. Defaults to `id`. Settable via `rename_session`. */
  readonly title: string;
  /** ISO-8601 timestamp the session was created. */
  readonly createdAt: string;
  /** ISO-8601 timestamp of the last write. */
  readonly updatedAt: string;
  /** Schema version the file was written with. */
  readonly schemaVersion: number;
}

/**
 * A single completed agent call. Captured after `afterCallResult` fires
 * with the user message recorded by the matching `beforeCall`.
 */
export interface SessionTurn {
  /** Run that produced this turn. */
  readonly runId: string;
  /** Strategy name (from the loaded strategy). */
  readonly strategyName: string;
  /** Agent name within the strategy that produced the response. */
  readonly agentName: string;
  /** ISO-8601 timestamp the call started (captured at beforeCall). */
  readonly startedAt: string;
  /** ISO-8601 timestamp the call completed (captured at afterCallResult). */
  readonly completedAt: string;
  /** Final text response. */
  readonly text: string;
  /** Prompt/completion token totals for this call. */
  readonly usage: {
    readonly promptTokens: number;
    readonly completionTokens: number;
  };
  /** Why the agent stopped. */
  readonly finishReason: string;
  /** The user message that triggered this call (raw string passed to `agent.call`). */
  readonly userMessage: string;
  /**
   * The full assistant + tool message chain produced by this call.
   * Stored as `unknown` because the underlying AI SDK union types are
   * not trivially Zod-able and the daemon does not need to introspect them.
   */
  readonly responseMessages: ReadonlyArray<unknown>;
}

/** Audit summary of a single run that contributed to this session. */
export interface SessionRunSummary {
  readonly runId: string;
  readonly strategyName: string;
  readonly strategyPath: string;
  readonly startedAt: string;
  readonly completedAt: string | null;
  readonly status: RunStatus;
  readonly error?: { readonly code: string; readonly message: string };
}

/** The full persisted session payload returned by `load_session`. */
export interface PersistedSession {
  readonly metadata: SessionMetadata;
  readonly turns: ReadonlyArray<SessionTurn>;
  readonly runs: ReadonlyArray<SessionRunSummary>;
}
