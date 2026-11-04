import { operationError, runError, RunErrorCode } from "../../errors";
import {
  runDirectory,
  writeRunDocument,
} from "../../state/storage/storage.utils";
import {
  closeSync,
  existsSync,
  fsyncSync,
  mkdirSync,
  openSync,
  readFileSync,
  statSync,
  readSync,
  writeSync,
} from "node:fs";
import { join } from "node:path";
import { RunSnapshotSchema } from "../../state/state.schemas";
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
    const pending = previous
      .catch(() => undefined)
      .then(operation)
      .catch((cause: unknown) => {
        if (
          cause instanceof Error &&
          "code" in cause &&
          (cause.code === RunErrorCode.INVALID_CURSOR ||
            cause.code === RunErrorCode.INVALID_ARGUMENTS)
        ) {
          throw cause;
        }
        throw runError(
          operationError(RunErrorCode.PERSISTENCE_ERROR, runId, cause),
        );
      });
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
  const reserved = new Map<string, Set<string>>();
  function reserve(runId: string, messageId: string): void {
    const identities = reserved.get(runId) ?? new Set<string>();
    const directory = join(runDirectory(runsDir, runId), "history");
    if (
      identities.has(messageId) ||
      existsSync(join(directory, `${encodeURIComponent(messageId)}.json`))
    ) {
      return;
    }
    mkdirSync(directory, { recursive: true });
    const descriptor = openSync(join(directory, "index.jsonl"), "a");
    try {
      writeSync(
        descriptor,
        `${JSON.stringify(messageId)}\n`,
        undefined,
        "utf8",
      );
      fsyncSync(descriptor);
    } finally {
      closeSync(descriptor);
    }
    identities.add(messageId);
    reserved.set(runId, identities);
  }
  return {
    reserve(runId, messageId) {
      return serialized(runId, () => reserve(runId, messageId));
    },
    entry(runId, messageId) {
      return serialized(runId, () => {
        const path = join(
          runDirectory(runsDir, runId),
          "history",
          `${encodeURIComponent(messageId)}.json`,
        );
        return existsSync(path)
          ? RunHistoryEntrySchema.parse(JSON.parse(readFileSync(path, "utf8")))
          : undefined;
      });
    },
    save(entry) {
      return serialized(entry.runId, () => {
        RunHistoryEntrySchema.parse(entry);
        const directory = join(runDirectory(runsDir, entry.runId), "history");
        reserve(entry.runId, entry.messageId);
        writeRunDocument(
          join(directory, `${encodeURIComponent(entry.messageId)}.json`),
          entry,
        );
        const identities = reserved.get(entry.runId);
        identities?.delete(entry.messageId);
        if (identities?.size === 0) {
          reserved.delete(entry.runId);
        }
      });
    },
    read(runId, options = {}) {
      return serialized(runId, () => {
        if (
          options.limit !== undefined &&
          (!Number.isSafeInteger(options.limit) || options.limit < 1)
        ) {
          throw runError({ code: RunErrorCode.INVALID_ARGUMENTS });
        }
        const directory = join(runDirectory(runsDir, runId), "history");
        const indexPath = join(directory, "index.jsonl");
        const size = existsSync(indexPath) ? statSync(indexPath).size : 0;
        const before = historyBoundary(options.before, runId, size);
        if (size === 0) {
          return { entries: [], page: { hasMore: false } };
        }
        if (before > 0 && before < size) {
          const descriptor = openSync(indexPath, "r");
          try {
            const boundary = Buffer.alloc(1);
            readSync(descriptor, boundary, 0, 1, before - 1);
            if (boundary[0] !== 10) {
              throw runError({ code: RunErrorCode.INVALID_CURSOR });
            }
          } finally {
            closeSync(descriptor);
          }
        }
        const metadataPath = join(runDirectory(runsDir, runId), "run.json");
        const changes = existsSync(metadataPath)
          ? (RunSnapshotSchema.parse(
              JSON.parse(readFileSync(metadataPath, "utf8")),
            ).strategyState?.changes ?? [])
          : [];
        const entries: RunHistoryEntry[] = [];
        let oldestPosition = before;
        let hasMore = false;
        for (const indexed of readHistoryIndex(indexPath, before)) {
          const entryPath = join(
            directory,
            `${encodeURIComponent(indexed.messageId)}.json`,
          );
          const entry = existsSync(entryPath)
            ? RunHistoryEntrySchema.parse(
                JSON.parse(readFileSync(entryPath, "utf8")),
              )
            : changes.find((change) => change.messageId === indexed.messageId);
          if (entry === undefined) {
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
