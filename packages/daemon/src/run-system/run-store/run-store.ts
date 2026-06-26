import {
  appendFileSync,
  closeSync,
  existsSync,
  fsyncSync,
  mkdirSync,
  openSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";
import type { TimelineEvent } from "@comma-agents/core";
import type { RunStatus } from "../../state/state.types";
import type {
  CreateRunStoreOptions,
  RunConfig,
  RunOverview,
  RunStore,
} from "./run-store.types";
import { readRunEventsFile } from "./run-store.utils";

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

  function runConfigFilePath(runId: string): string {
    return join(runsDir, `${runId}.config.json`);
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

        // Use the latest lifecycle segment because continuations append another
        // run_started/run_completed pair to the same logical run timeline.
        const latestStartedIndex = events.findLastIndex(
          (event) => event.type === "run_started",
        );
        const started = events[latestStartedIndex];
        if (!started || started.type !== "run_started") continue;

        const completed = events
          .slice(latestStartedIndex + 1)
          .findLast((event) => event.type === "run_completed");

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
        const configPath = runConfigFilePath(runId);
        if (!existsSync(filePath) && !existsSync(configPath)) return false;
        try {
          rmSync(filePath, { force: true });
          rmSync(configPath, { force: true });
          return true;
        } catch {
          return false;
        }
      });
    },

    async getRunConfig(runId): Promise<RunConfig | undefined> {
      const filePath = runConfigFilePath(runId);
      if (!existsSync(filePath)) return undefined;
      const parsed = JSON.parse(readFileSync(filePath, "utf8")) as unknown;
      if (
        typeof parsed !== "object" ||
        parsed === null ||
        !("enabledMcpServerIds" in parsed) ||
        !Array.isArray(parsed.enabledMcpServerIds) ||
        !parsed.enabledMcpServerIds.every(
          (serverId) => typeof serverId === "string",
        )
      ) {
        throw new Error(`Invalid run configuration: ${filePath}`);
      }
      return {
        enabledMcpServerIds: [...parsed.enabledMcpServerIds],
      };
    },

    async saveRunConfig(runId, config): Promise<void> {
      return runSerialized(runId, async () => {
        mkdirSync(runsDir, { recursive: true });
        const filePath = runConfigFilePath(runId);
        const temporaryPath = `${filePath}.${crypto.randomUUID()}.tmp`;
        writeFileSync(
          temporaryPath,
          `${JSON.stringify(config, null, 2)}\n`,
          "utf8",
        );
        renameSync(temporaryPath, filePath);
      });
    },
  };
}
