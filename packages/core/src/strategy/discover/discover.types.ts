// Strategy discovery types — shared shape for `discoverStrategies()` callers.

/**
 * Where a discovered strategy was found.
 *
 * - `bundled` — shipped with `@comma-agents/core` under `packages/core/strategies/`.
 * - `cwd` — single strategy file under `<cwd>/.comma/strategies/`.
 * - `cwd-project` — strategy referenced by a `comma-project.json`
 *   inside `<cwd>/.comma/strategies/<project>/`.
 * - `cwd-root-project` — strategy referenced by `<cwd>/.comma/comma-project.json`.
 * - `data` — single strategy file under `<dataDir>/strategies/`.
 * - `data-project` — strategy referenced by a `comma-project.json`
 *   inside `<dataDir>/strategies/<project>/`.
 */
export type DiscoveredStrategyOrigin =
  | "bundled"
  | "bundled-project"
  | "cwd"
  | "cwd-project"
  | "cwd-root-project"
  | "data"
  | "data-project";

/** A successfully discovered and schema-validated strategy. */
export interface DiscoveredStrategy {
  /** Strategy `name` field from the file. */
  readonly name: string;
  /** Optional strategy `description` field. */
  readonly description?: string;
  /** Strategy `version` field. */
  readonly version: string;
  /** Absolute path to the strategy file on disk. */
  readonly path: string;
  /**
   * When the strategy is part of a project, the absolute path to the
   * project's `comma-project.json`. Used by the daemon to call
   * `loadProject(manifestPath)` before loading the strategy.
   */
  readonly manifestPath?: string;
  /** Where this strategy was found. */
  readonly origin: DiscoveredStrategyOrigin;
  /**
   * Human-readable label. For project-scoped strategies this is
   * `"<project> > <name>"`; otherwise just `<name>`.
   */
  readonly label: string;
}

/** A discovery candidate that could not be loaded or validated. */
export interface DiscoveryWarning {
  /** Absolute path to the candidate that failed. */
  readonly path: string;
  /** Reason the candidate was excluded (parse/validation error message). */
  readonly reason: string;
}

/** Options for {@link discoverStrategies}. */
export interface DiscoverStrategiesOptions {
  /** Working directory to scan for `.comma/strategies/`. Defaults to `process.cwd()`. */
  readonly cwd?: string;
  /**
   * Platform data directory to scan for `strategies/`.
   * Defaults to `resolveDataDir()`.
   */
  readonly dataDir?: string;
  /**
   * Whether to include the strategies bundled with `@comma-agents/core`
   * (under `packages/core/strategies/`). Defaults to `true`.
   */
  readonly includeBundled?: boolean;
}

/** Result of {@link discoverStrategies}. */
export interface DiscoverStrategiesResult {
  /**
   * Schema-validated strategies, in source-priority order:
   * bundled → cwd → cwd-project → cwd-root-project → data → data-project.
   * Duplicates (by absolute path) are removed.
   */
  readonly strategies: readonly DiscoveredStrategy[];
  /** Files that were skipped because they failed to parse or validate. */
  readonly warnings: readonly DiscoveryWarning[];
}
