import { StoredRunSnapshotSchema } from "../../state/state.schemas";
import {
  closeSync,
  existsSync,
  fsyncSync,
  mkdirSync,
  openSync,
  readFileSync,
  renameSync,
  statSync,
  readSync,
  writeSync,
} from "node:fs";
import { join } from "node:path";
import { RunHistoryEntrySchema } from "../../messages/messages.schemas";
import type { RunHistoryEntry } from "../../messages";
import type { RunHistoryStorage } from "../history.types";
import { historyBoundary, readHistoryIndex } from "./storage.utils";

/**
 * Store per-message snapshots with an append-only creation index for bounded backward pagination.
 * @param {string} runsDir - Run storage directory.
 * @returns {RunHistoryStorage} Durable display-history operations.
 * @internal
 */
export function createRunHistoryStorage(runsDir: string): RunHistoryStorage {
  const queues = new Map<string, Promise<unknown>>();
  function serialized<Result>(
    runId: string,
    operation: () => Result,
  ): Promise<Result> {
    const previous = queues.get(runId) ?? Promise.resolve();
    const pending = previous.catch(() => undefined).then(operation);
    const tail = pending.then(
      () => undefined,
      () => undefined,
    );
    queues.set(runId, tail);
    void tail.then(() => {
      if (queues.get(runId) === tail) {
        queues.delete(runId);
      }
    });
    return pending;
  }
  return {
    saveSnapshot(snapshot) {
      return serialized(snapshot.runId, () => {
        const directory = join(
          runsDir,
          "history",
          encodeURIComponent(snapshot.runId),
        );
        mkdirSync(directory, { recursive: true });
        const path = join(directory, "snapshot.json");
        const temporary = `${path}.${crypto.randomUUID()}.tmp`;
        const descriptor = openSync(temporary, "w");
        try {
          writeSync(
            descriptor,
            JSON.stringify(StoredRunSnapshotSchema.parse(snapshot)),
            undefined,
            "utf8",
          );
          fsyncSync(descriptor);
        } finally {
          closeSync(descriptor);
        }
        renameSync(temporary, path);
      });
    },
    snapshot(runId) {
      return serialized(runId, () => {
        const path = join(
          runsDir,
          "history",
          encodeURIComponent(runId),
          "snapshot.json",
        );
        return existsSync(path)
          ? StoredRunSnapshotSchema.parse(
              JSON.parse(readFileSync(path, "utf8")),
            )
          : undefined;
      });
    },
    has(runId) {
      return existsSync(
        join(runsDir, "history", encodeURIComponent(runId), "index.jsonl"),
      );
    },
    save(entry) {
      return serialized(entry.runId, () => {
        RunHistoryEntrySchema.parse(entry);
        const directory = join(
          runsDir,
          "history",
          encodeURIComponent(entry.runId),
        );
        mkdirSync(directory, { recursive: true });
        const path = join(
          directory,
          `${encodeURIComponent(entry.messageId)}.json`,
        );
        const indexPath = join(directory, "index.jsonl");
        const isNew = !existsSync(path);
        const temporary = `${path}.${crypto.randomUUID()}.tmp`;
        const descriptor = openSync(temporary, "w");
        try {
          writeSync(descriptor, JSON.stringify(entry), undefined, "utf8");
          fsyncSync(descriptor);
        } finally {
          closeSync(descriptor);
        }
        renameSync(temporary, path);
        if (isNew) {
          const indexDescriptor = openSync(indexPath, "a");
          try {
            writeSync(
              indexDescriptor,
              `${JSON.stringify(entry.messageId)}\n`,
              undefined,
              "utf8",
            );
            fsyncSync(indexDescriptor);
          } finally {
            closeSync(indexDescriptor);
          }
        }
      });
    },
    read(runId, options = {}) {
      return serialized(runId, () => {
        if (
          options.limit !== undefined &&
          (!Number.isSafeInteger(options.limit) || options.limit < 1)
        ) {
          throw Object.assign(
            new Error("History limit must be a positive integer"),
            { code: "INVALID_ARGUMENTS" },
          );
        }
        const directory = join(runsDir, "history", encodeURIComponent(runId));
        const indexPath = join(directory, "index.jsonl");
        const size = existsSync(indexPath) ? statSync(indexPath).size : 0;
        const before = historyBoundary(options.before, runId, size);
        if (!size) {
          return { entries: [], page: { hasMore: false } };
        }
        if (before > 0 && before < size) {
          const descriptor = openSync(indexPath, "r");
          try {
            const boundary = Buffer.alloc(1);
            readSync(descriptor, boundary, 0, 1, before - 1);
            if (boundary[0] !== 10) {
              throw Object.assign(
                new Error("Invalid history cursor boundary"),
                { code: "INVALID_CURSOR" },
              );
            }
          } finally {
            closeSync(descriptor);
          }
        }
        const entries: RunHistoryEntry[] = [];
        let oldestPosition = before;
        let hasMore = false;
        for (const indexed of readHistoryIndex(indexPath, before)) {
          const entry = RunHistoryEntrySchema.parse(
            JSON.parse(
              readFileSync(
                join(
                  directory,
                  `${encodeURIComponent(indexed.messageId)}.json`,
                ),
                "utf8",
              ),
            ),
          );
          if (entry.type === "message" && entry.status === "streaming") {
            continue;
          }
          if (options.limit !== undefined && entries.length === options.limit) {
            hasMore = true;
            break;
          }
          entries.push(entry);
          oldestPosition = indexed.position;
        }
        return {
          entries: entries.reverse(),
          page: {
            hasMore,
            ...(hasMore
              ? {
                  before: Buffer.from(
                    JSON.stringify({
                      version: 1,
                      runId,
                      position: oldestPosition,
                    }),
                  ).toString("base64url"),
                }
              : {}),
          },
        };
      });
    },
  };
}
