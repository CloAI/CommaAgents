import type {
  PersistedSession,
  SessionMetadata,
  SessionRunSummary,
  SessionTurn,
} from "./sessions.types";

/**
 * Persistent per-cwd session store.
 *
 * Sessions are keyed by `cwd` — there is at most one active session per
 * normalized working directory. Multiple runs in the same directory append
 * turns to the same session.
 *
 * All on-disk operations are async and serialized per session to prevent
 * write races during streaming.
 */
export interface SessionStore {
  /**
   * Get the session for a given cwd, creating one if none exists.
   * Returns the full payload (metadata + existing turns/runs).
   */
  getOrCreateForCwd(cwd: string): Promise<PersistedSession>;

  /**
   * Synchronous variant of {@link SessionStore.getOrCreateForCwd}. Used at run-start
   * when a session id must be assigned before kicking off async execution.
   */
  getOrCreateForCwdSync(cwd: string): PersistedSession;

  /** Load a session by id. Returns null if not found. */
  load(sessionId: string): Promise<PersistedSession | null>;

  /**
   * List session metadata.
   * When `cwd` is provided, only sessions in that cwd's bucket are returned.
   */
  list(filter?: { readonly cwd?: string }): Promise<ReadonlyArray<SessionMetadata>>;

  /** Append a completed turn to a session. */
  appendTurn(sessionId: string, turn: SessionTurn): Promise<void>;

  /**
   * Insert or update a run summary on a session. Matching is by `runId` —
   * if a summary with the same runId exists, it is replaced (so callers
   * can record initial `running` then later `completed`).
   */
  recordRun(sessionId: string, summary: SessionRunSummary): Promise<void>;

  /** Set a session's title. Pass `null` to reset to the session id. */
  rename(sessionId: string, title: string | null): Promise<SessionMetadata>;

  /** Delete a session. Returns true if it existed. */
  delete(sessionId: string): Promise<boolean>;
}

/** Options for creating a file-backed session store. */
export interface CreateSessionStoreOptions {
  /** Root directory for sessions (e.g. `<dataDir>/sessions`). */
  readonly sessionsDir: string;
}
