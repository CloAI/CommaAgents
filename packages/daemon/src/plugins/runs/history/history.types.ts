import type { RunSnapshot } from "../runs.types";
import type { z } from "zod/v4";
import type { RunHistoryPageSchema } from "./history.schemas";
import type { RunHistoryEntry } from "../messages";

/** Optional bounds for retrieving older display history. Omitting them retrieves all finished entries. */
export interface RunHistoryOptions {
  /** Maximum number of entries, selected from the newest end of the requested range. */
  readonly limit?: number;
  /** Opaque boundary returned by a previous page. */
  readonly before?: string;
}
/** Chronologically ordered messages and the cursor for an older page. */
export type RunHistoryPage = z.infer<typeof RunHistoryPageSchema>;
/** @internal Durable message snapshots indexed once at their creation position. */
export interface RunHistoryStorage {
  saveSnapshot(snapshot: RunSnapshot): Promise<void>;
  snapshot(runId: string): Promise<RunSnapshot | undefined>;
  has(runId: string): boolean;
  save(entry: RunHistoryEntry): Promise<void>;
  read(runId: string, options?: RunHistoryOptions): Promise<RunHistoryPage>;
}
