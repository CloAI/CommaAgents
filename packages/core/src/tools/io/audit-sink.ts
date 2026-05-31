// Audit sink implementations: in-memory + JSONL file.
//
// File sink layout:
//   <workspaceRoot>/.comma/audit/<sessionId>.jsonl
// One JSON-encoded `AuditEntry` per line, no trailing comma, fsync'd
// on every append for crash durability.

import { appendFile, mkdir, open, readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import type { AuditEntry, AuditSink } from "./audit.types";

/**
 * In-memory audit sink. Used for tests and as a fallback when no
 * `sessionId` is available on the `ToolContext`.
 *
 * `list()` returns a defensive copy so callers cannot mutate the
 * internal buffer.
 */
export function createMemoryAuditSink(): AuditSink {
  const entries: AuditEntry[] = [];

  return {
    async append(entry: AuditEntry): Promise<void> {
      entries.push(entry);
    },
    async list(sessionId?: string): Promise<readonly AuditEntry[]> {
      if (sessionId === undefined) return [...entries];
      return entries.filter((entry) => entry.sessionId === sessionId);
    },
    async load(sessionId: string): Promise<readonly AuditEntry[]> {
      return entries.filter((entry) => entry.sessionId === sessionId);
    },
  };
}

/**
 * Options for {@link createFileAuditSink}.
 */
export interface FileAuditSinkOptions {
  /** Maximum number of bytes to keep per `diff` field. Longer diffs
   *  are truncated with a `…(truncated)` marker so a single huge
   *  rewrite doesn't bloat the log. Set to `Infinity` to disable. */
  readonly maxDiffBytes?: number;
}

const DEFAULT_MAX_DIFF_BYTES = 64 * 1024;

/**
 * JSONL-backed audit sink under `<workspaceRoot>/.comma/audit/`.
 *
 * - One file per session: `<sessionId>.jsonl`.
 * - Non-session entries (`sessionId` undefined) are routed to
 *   `default.jsonl` so they survive across processes.
 * - Each append: ensures the directory exists, writes the line,
 *   then `fsync`s the file. We tolerate the extra syscalls because
 *   audit volume is low (one per destructive op).
 */
export function createFileAuditSink(
  workspaceRoot: string,
  options: FileAuditSinkOptions = {},
): AuditSink {
  const auditDir = join(workspaceRoot, ".comma", "audit");
  const maxDiffBytes = options.maxDiffBytes ?? DEFAULT_MAX_DIFF_BYTES;

  function fileForSession(sessionId: string | undefined): string {
    return join(auditDir, `${sessionId ?? "default"}.jsonl`);
  }

  function truncateDiff(entry: AuditEntry): AuditEntry {
    if (entry.diff === undefined) return entry;
    if (entry.diff.length <= maxDiffBytes) return entry;
    return {
      ...entry,
      diff: `${entry.diff.slice(0, maxDiffBytes)}\n…(truncated, full diff exceeded ${maxDiffBytes} bytes)`,
    };
  }

  async function readAllSessions(): Promise<AuditEntry[]> {
    let files: string[];
    try {
      files = await readdir(auditDir);
    } catch {
      return [];
    }
    const out: AuditEntry[] = [];
    for (const filename of files) {
      if (!filename.endsWith(".jsonl")) continue;
      const entries = await readJsonl(join(auditDir, filename));
      out.push(...entries);
    }
    return out;
  }

  async function readJsonl(absolutePath: string): Promise<AuditEntry[]> {
    let content: string;
    try {
      content = await readFile(absolutePath, "utf8");
    } catch {
      return [];
    }
    const out: AuditEntry[] = [];
    for (const line of content.split("\n")) {
      if (line.length === 0) continue;
      try {
        out.push(JSON.parse(line) as AuditEntry);
      } catch {
        // Skip malformed lines — corruption of a single record
        // shouldn't prevent loading the rest of the session.
      }
    }
    return out;
  }

  return {
    async append(entry: AuditEntry): Promise<void> {
      await mkdir(auditDir, { recursive: true });
      const targetPath = fileForSession(entry.sessionId);
      const line = `${JSON.stringify(truncateDiff(entry))}\n`;
      await appendFile(targetPath, line);
      // fsync the file for crash durability. Open in append mode so
      // we don't truncate.
      const handle = await open(targetPath, "a");
      try {
        await handle.sync();
      } finally {
        await handle.close();
      }
    },

    async list(sessionId?: string): Promise<readonly AuditEntry[]> {
      if (sessionId !== undefined) {
        return readJsonl(fileForSession(sessionId));
      }
      return readAllSessions();
    },

    async load(sessionId: string): Promise<readonly AuditEntry[]> {
      return readJsonl(fileForSession(sessionId));
    },
  };
}
