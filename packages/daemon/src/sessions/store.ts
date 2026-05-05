import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { z } from "zod";
import {
  type PersistedSession,
  SESSION_SCHEMA_VERSION,
  type SessionMetadata,
  type SessionRunSummary,
  type SessionTurn,
} from "./sessions.types";
import { hashCwd, normalizeCwd } from "./sessions.utils";
import type { CreateSessionStoreOptions, SessionStore } from "./store.types";

const SessionMetadataSchema = z.object({
  id: z.string(),
  cwd: z.string(),
  cwdHash: z.string(),
  title: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
  schemaVersion: z.number().int(),
});

const SessionTurnSchema = z.object({
  runId: z.string(),
  strategyName: z.string(),
  agentName: z.string(),
  startedAt: z.string(),
  completedAt: z.string(),
  text: z.string(),
  usage: z.object({
    promptTokens: z.number(),
    completionTokens: z.number(),
  }),
  finishReason: z.string(),
  userMessage: z.string(),
  responseMessages: z.array(z.unknown()),
});

const SessionRunSummarySchema = z.object({
  runId: z.string(),
  strategyName: z.string(),
  strategyPath: z.string(),
  startedAt: z.string(),
  completedAt: z.string().nullable(),
  status: z.enum(["pending", "running", "completed", "error", "cancelled"]),
  error: z
    .object({
      code: z.string(),
      message: z.string(),
    })
    .optional(),
});

const PersistedSessionSchema = z.object({
  metadata: SessionMetadataSchema,
  turns: z.array(SessionTurnSchema),
  runs: z.array(SessionRunSummarySchema),
});

/** Read a JSON session file. Returns null on missing/corrupt/invalid. */
function readSessionFile(filePath: string): PersistedSession | null {
  if (!existsSync(filePath)) return null;

  let raw: string;
  try {
    raw = readFileSync(filePath, "utf-8");
  } catch {
    return null;
  }

  if (raw.trim() === "") return null;

  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    return null;
  }

  const parsed = PersistedSessionSchema.safeParse(json);
  if (!parsed.success) return null;
  return parsed.data as PersistedSession;
}

/** Atomically write a JSON session file. */
function writeSessionFile(filePath: string, payload: PersistedSession): void {
  const dir = dirname(filePath);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
  const tmp = `${filePath}.tmp`;
  writeFileSync(tmp, JSON.stringify(payload, null, 2), { encoding: "utf-8", mode: 0o600 });
  renameSync(tmp, filePath);
}

/**
 * Create a file-backed session store rooted at `<sessionsDir>/<cwdHash>/<sessionId>.json`.
 *
 * Per-session writes are serialized via an in-memory promise queue so concurrent
 * `appendTurn` / `recordRun` calls don't clobber each other.
 *
 * @example
 * ```ts
 * const store = createSessionStore({ sessionsDir: "/path/to/sessions" });
 * const session = await store.getOrCreateForCwd("/Users/me/project");
 * await store.appendTurn(session.metadata.id, turn);
 * ```
 */
export function createSessionStore(options: CreateSessionStoreOptions): SessionStore {
  const { sessionsDir } = options;

  /** Resolved sessionId → filesystem path. Populated lazily on first lookup. */
  const idToPath = new Map<string, string>();

  /** sessionId → tail of the per-session write queue. */
  const writeQueues = new Map<string, Promise<unknown>>();

  /**
   * Run an operation in the per-session serialization queue.
   * The queue is keyed by sessionId; queued ops run sequentially.
   */
  function runSerialized<ResultType>(
    sessionId: string,
    operation: () => Promise<ResultType>,
  ): Promise<ResultType> {
    const previous = writeQueues.get(sessionId) ?? Promise.resolve();
    const next = previous.catch(() => undefined).then(operation);
    // Track a swallow-on-failure variant so unrelated callers don't see
    // unhandled rejections via the queue tail. Errors still surface to the
    // caller awaiting `next` directly.
    const tail = next.then(
      () => undefined,
      () => undefined,
    );
    writeQueues.set(
      sessionId,
      tail.finally(() => {
        if (writeQueues.get(sessionId) === tail) {
          writeQueues.delete(sessionId);
        }
      }),
    );
    return next;
  }

  function bucketDirFor(cwdHashValue: string): string {
    return join(sessionsDir, cwdHashValue);
  }

  function sessionFilePath(cwdHashValue: string, sessionId: string): string {
    return join(bucketDirFor(cwdHashValue), `${sessionId}.json`);
  }

  /** Walk `sessionsDir` and locate the file for a sessionId. */
  function locateSessionFile(sessionId: string): string | null {
    const cached = idToPath.get(sessionId);
    if (cached && existsSync(cached)) return cached;

    if (!existsSync(sessionsDir)) return null;
    const buckets = readdirSync(sessionsDir, { withFileTypes: true });
    for (const bucket of buckets) {
      if (!bucket.isDirectory()) continue;
      const candidate = join(sessionsDir, bucket.name, `${sessionId}.json`);
      if (existsSync(candidate)) {
        idToPath.set(sessionId, candidate);
        return candidate;
      }
    }
    return null;
  }

  /** Load every session file under `sessionsDir`, optionally restricted to a single bucket. */
  function listAllSessions(restrictBucket?: string): SessionMetadata[] {
    if (!existsSync(sessionsDir)) return [];

    const collected: SessionMetadata[] = [];
    const buckets = restrictBucket
      ? [restrictBucket]
      : readdirSync(sessionsDir, { withFileTypes: true })
          .filter((entry) => entry.isDirectory())
          .map((entry) => entry.name);

    for (const bucket of buckets) {
      const bucketPath = join(sessionsDir, bucket);
      if (!existsSync(bucketPath)) continue;
      let entries: string[];
      try {
        entries = readdirSync(bucketPath);
      } catch {
        continue;
      }
      for (const entry of entries) {
        if (!entry.endsWith(".json")) continue;
        const filePath = join(bucketPath, entry);
        const payload = readSessionFile(filePath);
        if (!payload) continue;
        idToPath.set(payload.metadata.id, filePath);
        collected.push(payload.metadata);
      }
    }
    return collected;
  }

  function findExistingSessionForCwd(normalizedCwd: string, cwdHashValue: string): PersistedSession | null {
    const bucketPath = bucketDirFor(cwdHashValue);
    if (!existsSync(bucketPath)) return null;
    let entries: string[];
    try {
      entries = readdirSync(bucketPath);
    } catch {
      return null;
    }
    for (const entry of entries) {
      if (!entry.endsWith(".json")) continue;
      const filePath = join(bucketPath, entry);
      const payload = readSessionFile(filePath);
      if (payload && payload.metadata.cwd === normalizedCwd) {
        idToPath.set(payload.metadata.id, filePath);
        return payload;
      }
    }
    return null;
  }

  function createNewSession(normalizedCwd: string, cwdHashValue: string): PersistedSession {
    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    const metadata: SessionMetadata = {
      id,
      cwd: normalizedCwd,
      cwdHash: cwdHashValue,
      title: id,
      createdAt: now,
      updatedAt: now,
      schemaVersion: SESSION_SCHEMA_VERSION,
    };
    const session: PersistedSession = { metadata, turns: [], runs: [] };
    const filePath = sessionFilePath(cwdHashValue, id);
    writeSessionFile(filePath, session);
    idToPath.set(id, filePath);
    return session;
  }

  return {
    async getOrCreateForCwd(cwd: string): Promise<PersistedSession> {
      const normalized = normalizeCwd(cwd);
      const cwdHashValue = hashCwd(normalized);
      const existing = findExistingSessionForCwd(normalized, cwdHashValue);
      if (existing) return existing;
      return createNewSession(normalized, cwdHashValue);
    },

    getOrCreateForCwdSync(cwd: string): PersistedSession {
      const normalized = normalizeCwd(cwd);
      const cwdHashValue = hashCwd(normalized);
      const existing = findExistingSessionForCwd(normalized, cwdHashValue);
      if (existing) return existing;
      return createNewSession(normalized, cwdHashValue);
    },

    async load(sessionId: string): Promise<PersistedSession | null> {
      const filePath = locateSessionFile(sessionId);
      if (!filePath) return null;
      return readSessionFile(filePath);
    },

    async list(filter): Promise<ReadonlyArray<SessionMetadata>> {
      if (filter?.cwd !== undefined) {
        const normalized = normalizeCwd(filter.cwd);
        return listAllSessions(hashCwd(normalized)).filter(
          (metadata) => metadata.cwd === normalized,
        );
      }
      return listAllSessions();
    },

    async appendTurn(sessionId: string, turn: SessionTurn): Promise<void> {
      return runSerialized(sessionId, async () => {
        const filePath = locateSessionFile(sessionId);
        if (!filePath) {
          throw new Error(`Session not found: ${sessionId}`);
        }
        const session = readSessionFile(filePath);
        if (!session) {
          throw new Error(`Session file unreadable: ${sessionId}`);
        }
        const updated: PersistedSession = {
          metadata: { ...session.metadata, updatedAt: new Date().toISOString() },
          turns: [...session.turns, turn],
          runs: session.runs,
        };
        writeSessionFile(filePath, updated);
      });
    },

    async recordRun(sessionId: string, summary: SessionRunSummary): Promise<void> {
      return runSerialized(sessionId, async () => {
        const filePath = locateSessionFile(sessionId);
        if (!filePath) {
          throw new Error(`Session not found: ${sessionId}`);
        }
        const session = readSessionFile(filePath);
        if (!session) {
          throw new Error(`Session file unreadable: ${sessionId}`);
        }
        const existingIndex = session.runs.findIndex((entry) => entry.runId === summary.runId);
        const nextRuns = existingIndex === -1
          ? [...session.runs, summary]
          : session.runs.map((entry, index) => (index === existingIndex ? summary : entry));
        const updated: PersistedSession = {
          metadata: { ...session.metadata, updatedAt: new Date().toISOString() },
          turns: session.turns,
          runs: nextRuns,
        };
        writeSessionFile(filePath, updated);
      });
    },

    async rename(sessionId: string, title: string | null): Promise<SessionMetadata> {
      return runSerialized(sessionId, async () => {
        const filePath = locateSessionFile(sessionId);
        if (!filePath) {
          throw new Error(`Session not found: ${sessionId}`);
        }
        const session = readSessionFile(filePath);
        if (!session) {
          throw new Error(`Session file unreadable: ${sessionId}`);
        }
        const nextTitle = title ?? session.metadata.id;
        const updatedMetadata: SessionMetadata = {
          ...session.metadata,
          title: nextTitle,
          updatedAt: new Date().toISOString(),
        };
        writeSessionFile(filePath, {
          metadata: updatedMetadata,
          turns: session.turns,
          runs: session.runs,
        });
        return updatedMetadata;
      });
    },

    async delete(sessionId: string): Promise<boolean> {
      return runSerialized(sessionId, async () => {
        const filePath = locateSessionFile(sessionId);
        if (!filePath || !existsSync(filePath)) return false;
        rmSync(filePath, { force: true });
        idToPath.delete(sessionId);
        return true;
      });
    },
  };
}
