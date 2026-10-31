import type { z } from "zod/v4";
import type { RunHistoryPageSchema } from "./history.schemas";
import type { RunHistoryEntry } from "../messages";
/** Optional bounds; omitting a limit returns all finalized display entries. */
export interface RunHistoryOptions {
  readonly limit?: number;
  readonly before?: string;
}
/** Chronological display entries and an opaque cursor towards older entries. */
export type RunHistoryPage = z.infer<typeof RunHistoryPageSchema>;
/** @internal Independent finalized display storage for each run. */
export interface RunHistoryStorage {
  reserve(runId: string, messageId: string): Promise<void>;
  entry(runId: string, messageId: string): Promise<RunHistoryEntry | undefined>;
  save(entry: RunHistoryEntry): Promise<void>;
  read(runId: string, options?: RunHistoryOptions): Promise<RunHistoryPage>;
}
