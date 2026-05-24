import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  appendFileSync,
  openSync,
  fsyncSync,
  closeSync,
} from "node:fs";
import { dirname, join } from "node:path";
import type { TimelineEvent } from "@comma-agents/core";
import type { RunStatus } from "../state/state.types";
import type {
  CreateRunStoreOptions,
  RunOverview,
  RunStore,
} from "./runs.types";

/** Read a JSONL run file and return parsed events. Malformed lines are skipped. */
function readRunEventsFile(filePath: string): TimelineEvent[] {
  if (!existsSync(filePath)) return [];

  let raw: string;
  try {
    raw = readFileSync(filePath, "utf-8");
  } catch {
    return [];
  }

  const events: TimelineEvent[] = [];
  const lines = raw.split("\n");
  for (const line of lines) {
    if (line.trim() === "") continue;
    try {
      events.push(JSON.parse(line) as TimelineEvent);
    } catch {
      // Ignore malformed lines to survive single-record corruption
    }
  }
  return events;
}

/**
 * Create a file-backed run store rooted at `<runsDir>/<runId>.jsonl`.
 *
 * Each run is stored as an append-only JSONL stream of TimelineEvents.
 * Per-run writes are serialized via an in-memory promise queue.
 */
export function createRunStore(options: CreateRunStoreOptions): RunStore {
  const { runsDir } = options;

  /** runId → tail of the per-run write queue. */
  const writeQueues = new Map<string, Promise<unknown>>();

  /**
   * Run an operation in the per-run serialization queue.
   */
  function runSerialized<ResultType>(
    runId: string,
    operation: () => Promise<ResultType>,
  ): Promise<ResultType> {
    const previous = writeQueues.get(runId) ?? Promise.resolve();
    const next = previous.catch(() => undefined).then(operation);
    const tail = next.then(
      () => undefined,
      () => undefined,
    );
    writeQueues.set(
      runId,
      tail.finally(() => {
        if (writeQueues.get(runId) === tail) {
          writeQueues.delete(runId);
        }
      }),
    );
    return next;
  }

  function runFilePath(runId: string): string {
    return join(runsDir, `${runId}.jsonl`);
  }

  return {
    async appendEvent(runId, event): Promise<void> {
      return runSerialized(runId, async () => {
        const filePath = runFilePath(runId);
        const dir = dirname(filePath);
        if (!existsSync(dir)) {
          mkdirSync(dir, { recursive: true });
        }

        const line = `${JSON.stringify(event)}\n`;
        appendFileSync(filePath, line, "utf-8");

        // fsync for crash durability
        try {
          const fd = openSync(filePath, "a");
          fsyncSync(fd);
          closeSync(fd);
        } catch {
          // Fallback if fsync fails in constrained environments
        }
      });
    },

    async getEvents(runId): Promise<readonly TimelineEvent[]> {
      const filePath = runFilePath(runId);
      return readRunEventsFile(filePath);
    },

    async listRuns(filter): Promise<readonly RunOverview[]> {
      if (!existsSync(runsDir)) return [];

      let entries: string[];
      try {
        entries = readdirSync(runsDir);
      } catch {
        return [];
      }

      const results: RunOverview[] = [];
      for (const entry of entries) {
        if (!entry.endsWith(".jsonl")) continue;
        const filePath = join(runsDir, entry);
        const events = readRunEventsFile(filePath);
        if (events.length === 0) continue;

        // Find run_started (at index 0 or near start)
        const started = events.find((ev) => ev.type === "run_started");
        if (!started || started.type !== "run_started") continue;

        // Find latest run_completed (if any)
        const completed = [...events]
          .reverse()
          .find((ev) => ev.type === "run_completed");

        const runId = entry.slice(0, -6); // strip `.jsonl`

        let status: RunStatus = "running";
        let completedAt: string | null = null;
        if (completed && completed.type === "run_completed") {
          status = completed.status;
          completedAt = completed.ts;
        }

        if (filter?.cwd !== undefined && started.cwd !== filter.cwd) {
          continue;
        }

        results.push({
          runId,
          cwd: started.cwd,
          strategyName: started.strategyName,
          strategyPath: started.strategyPath,
          startedAt: started.ts,
          completedAt,
          status,
        });
      }

      // Sort starting at ts desc
      return results.sort((a, b) => b.startedAt.localeCompare(a.startedAt));
    },

    async deleteRun(runId): Promise<boolean> {
      const filePath = runFilePath(runId);
      return runSerialized(runId, async () => {
        if (!existsSync(filePath)) return false;
        try {
          rmSync(filePath);
          return true;
        } catch {
          return false;
        }
      });
    },
  };
}
