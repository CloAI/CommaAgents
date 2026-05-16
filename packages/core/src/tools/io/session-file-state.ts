// Session file state — derives "files the agent has already touched"
// from an audit log so the prompt-builder can hand the LLM the most
// recent known sha256 for each path.
//
// Resumed sessions read the audit JSONL on load (see `Session.hydrate`
// in the agents package) and store the resulting `SessionFileState` so
// follow-up tool calls can pass `expectedSha256` without re-reading
// the file just to retrieve a hash that's already in the log.
//
// Cross-session staleness:
//   If the on-disk sha256 no longer matches the audit log's
//   `afterSha256` for a path (someone edited the file outside the
//   agent), we mark the entry as `stale: true` in the state so the
//   LLM is forced to re-read before mutating.

import type { AuditEntry } from "./audit";
import { sha256OfFile } from "./hash";

/**
 * Most-recent known state for a single file in this session.
 */
export interface SessionFileEntry {
  /**
   * Workspace-relative path of the file.
   */
  readonly path: string;
  /**
   * SHA-256 the agent last produced or observed for this file. For
   * deleted files this is the hash at the moment of deletion (so the
   * LLM can re-create with the correct expected hash if it wants).
   */
  readonly sha256: string;
  /**
   * `true` when the file is known to have been deleted in this
   * session (most recent audit entry was a `"delete"`). Lookups still
   * return the entry so the LLM can see it was deleted.
   */
  readonly deleted: boolean;
  /**
   * `true` when the on-disk hash no longer matches `sha256` (the file
   * was edited outside the agent between sessions). Set by
   * `verifySessionFileState` — defaults to `false` from
   * `buildSessionFileState` alone.
   */
  readonly stale: boolean;
}

/**
 * Snapshot of every file path the session has touched, keyed by
 * workspace-relative path.
 *
 * Immutable from the caller's perspective: rebuild by replaying the
 * audit log rather than mutating in place.
 */
export type SessionFileState = ReadonlyMap<string, SessionFileEntry>;

/**
 * Replay an ordered audit log into a `SessionFileState`.
 *
 * Replay rules (deterministic, audit-log order):
 * - `"create"` / `"update"` → set `{ sha256: afterSha256, deleted: false }`.
 *   `afterSha256` is required; entries missing it are skipped (defensive
 *   against malformed log lines).
 * - `"delete"` → set `{ sha256: beforeSha256 ?? "", deleted: true }`.
 * - `"move"` → delete the source entry, then upsert the target with
 *   `afterSha256`.
 * - Failed entries (`success: false`) are skipped — they didn't
 *   mutate disk so the prior state stands.
 *
 * Replays run in O(n) over the entries. Caller is responsible for
 * passing entries in chronological order; `AuditSink.load` guarantees
 * insertion order, which is chronological.
 */
export function buildSessionFileState(
  entries: readonly AuditEntry[],
): SessionFileState {
  const state = new Map<string, SessionFileEntry>();

  for (const entry of entries) {
    if (!entry.success) continue;

    switch (entry.operation) {
      case "create":
      case "update": {
        if (entry.afterSha256 === undefined) continue;
        state.set(entry.path, {
          path: entry.path,
          sha256: entry.afterSha256,
          deleted: false,
          stale: false,
        });
        break;
      }
      case "delete": {
        state.set(entry.path, {
          path: entry.path,
          sha256: entry.beforeSha256 ?? "",
          deleted: true,
          stale: false,
        });
        break;
      }
      case "move": {
        if (entry.toPath === undefined || entry.afterSha256 === undefined) {
          continue;
        }
        state.delete(entry.path);
        state.set(entry.toPath, {
          path: entry.toPath,
          sha256: entry.afterSha256,
          deleted: false,
          stale: false,
        });
        break;
      }
    }
  }

  return state;
}

/**
 * For each known (non-deleted) entry in `state`, recompute the
 * on-disk SHA-256 and flag entries whose stored hash no longer
 * matches as `stale`. Missing files (`ENOENT`) are also flagged
 * stale so the LLM can decide whether to re-create.
 *
 * Returns a fresh `SessionFileState` — does not mutate the input.
 *
 * @param state - Result of `buildSessionFileState`.
 * @param resolveAbsolute - Map workspace-relative path → absolute
 *   path. Provided by the caller so this module stays sandbox-free.
 */
export async function verifySessionFileState(
  state: SessionFileState,
  resolveAbsolute: (path: string) => string,
): Promise<SessionFileState> {
  const verified = new Map<string, SessionFileEntry>();

  for (const [path, entry] of state) {
    if (entry.deleted) {
      verified.set(path, entry);
      continue;
    }

    let onDisk: string | undefined;
    try {
      onDisk = await sha256OfFile(resolveAbsolute(path));
    } catch {
      onDisk = undefined;
    }

    const stale = onDisk === undefined || onDisk !== entry.sha256;
    verified.set(path, stale ? { ...entry, stale: true } : entry);
  }

  return verified;
}
