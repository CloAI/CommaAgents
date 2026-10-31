import { operationError, runError, RunErrorCode } from "../../errors";
import {
  closeSync,
  existsSync,
  fsyncSync,
  mkdirSync,
  openSync,
  readFileSync,
  writeSync,
} from "node:fs";
import { join } from "node:path";
import { RunSnapshotSchema } from "../state.schemas";
import { ConversationEventSchema } from "../../conversation/conversation.schemas";
import type { RunStorage } from "./storage.types";
import { runDirectory, writeRunDocument } from "./storage.utils";
/**
 *  Create file-backed metadata and conversation storage for independent runs.
 * @param {string} runsDir - Directory containing independent run storage.
 * @returns {RunStorage} Independent durable run operations.
 * @internal
 */
export function createRunStorage(runsDir: string): RunStorage {
  const queues = new Map<string, Promise<unknown>>();
  function serialized<Result>(
    runId: string,
    operation: () => Result,
  ): Promise<Result> {
    const writing = (queues.get(runId) ?? Promise.resolve())
      .catch(() => undefined)
      .then(operation)
      .catch((cause: unknown) => {
        throw runError(
          operationError(RunErrorCode.PERSISTENCE_ERROR, runId, cause),
        );
      });
    const tail = writing.then(
      () => undefined,
      () => undefined,
    );
    queues.set(runId, tail);
    void tail.then(() => {
      if (queues.get(runId) === tail) {
        queues.delete(runId);
      }
    });
    return writing;
  }
  return {
    save(snapshot) {
      return serialized(snapshot.runId, () => {
        const directory = runDirectory(runsDir, snapshot.runId);
        mkdirSync(directory, { recursive: true });
        writeRunDocument(
          join(directory, "run.json"),
          RunSnapshotSchema.parse(snapshot),
        );
      });
    },
    read(runId) {
      return serialized(runId, () => {
        const path = join(runDirectory(runsDir, runId), "run.json");
        if (!existsSync(path)) {
          return undefined;
        }
        const snapshot = RunSnapshotSchema.parse(
          JSON.parse(readFileSync(path, "utf8")),
        );
        if (snapshot.runId !== runId) {
          throw new Error("Run identity does not match its document");
        }
        return snapshot;
      });
    },
    append(runId, event) {
      return serialized(runId, () => {
        const directory = runDirectory(runsDir, runId);
        mkdirSync(directory, { recursive: true });
        const serialized = JSON.stringify(event);
        ConversationEventSchema.parse(JSON.parse(serialized));
        const descriptor = openSync(join(directory, "conversation.jsonl"), "a");
        try {
          writeSync(descriptor, `${serialized}\n`, undefined, "utf8");
          fsyncSync(descriptor);
        } finally {
          closeSync(descriptor);
        }
      });
    },
    conversation(runId) {
      return serialized(runId, () => {
        const path = join(runDirectory(runsDir, runId), "conversation.jsonl");
        if (!existsSync(path)) {
          return [];
        }
        return readFileSync(path, "utf8")
          .split("\n")
          .filter((line) => line.length !== 0)
          .map((line) => ConversationEventSchema.parse(JSON.parse(line)));
      });
    },
  };
}
