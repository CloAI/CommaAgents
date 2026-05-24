import type { DiscoveredStrategyOrigin } from "../../../strategy/discover/discover.types";

/** A single entry in the `list_strategy` result. */
export interface ListStrategyEntry {
  /** Strategy `name` field. */
  readonly name: string;
  /** Strategy `description` field, when present. */
  readonly description?: string;
  /** Strategy `version` field. */
  readonly version: string;
  /** Absolute path to the strategy file on disk. */
  readonly path: string;
  /** Where the strategy was found. See {@link DiscoveredStrategyOrigin}. */
  readonly origin: DiscoveredStrategyOrigin;
  /** Project manifest path when the strategy is part of a project. */
  readonly manifestPath?: string;
  /** Human-readable label (project-qualified when applicable). */
  readonly label: string;
}

/** Structured payload returned by `list_strategy.execute`. */
export interface ListStrategyData {
  /** Validated, ready-to-launch strategies in discovery-priority order. */
  readonly strategies: readonly ListStrategyEntry[];
  /** Total number of strategies returned. */
  readonly count: number;
  /**
   * Files that were skipped during discovery (parse / schema errors).
   * Surfaced for diagnostics; never includable in {@link strategies}.
   */
  readonly warnings: readonly {
    readonly path: string;
    readonly reason: string;
  }[];
}
