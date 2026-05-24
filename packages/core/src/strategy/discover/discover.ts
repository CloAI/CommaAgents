// Strategy discovery — find available strategies on disk.
//
// Promoted from the TUI into core so that the new built-in
// `list_strategy` / `launch_strategy` tools and the TUI share a
// single implementation. Sources scanned (in priority order):
//
//   1. Bundled — `<core-pkg-root>/strategies/*.{json,jsonc,yaml,yml}`
//                and `<core-pkg-root>/strategies/<project>/comma-project.json`
//   2. Cwd     — `<cwd>/.comma/strategies/*.{json,jsonc,yaml,yml}`
//   3. Cwd projects — `<cwd>/.comma/strategies/<project>/comma-project.json`
//   4. Cwd root project — `<cwd>/.comma/comma-project.json`
//   5. Data    — `<dataDir>/strategies/*.{json,jsonc,yaml,yml}`
//   6. Data projects — `<dataDir>/strategies/<project>/comma-project.json`
//
// Each candidate is parsed and validated against `StrategySchema`
// (or `CommaProjectManifestSchema` for project files). Invalid files
// are excluded from the result and surfaced in `warnings`.
//
// Discovery is duplicate-free: every entry has a unique absolute
// `path`. When the same file is reachable from multiple sources, the
// higher-priority source wins.

import { existsSync } from "node:fs";
import { join } from "node:path";

import { resolveDataDir } from "../../credentials/credentials.utils";
import type {
  DiscoveredStrategy,
  DiscoveredStrategyOrigin,
  DiscoverStrategiesOptions,
  DiscoverStrategiesResult,
  DiscoveryWarning,
} from "./discover.types";
import {
  buildDiscoveredStrategy,
  findCorePackageRoot,
  listProjectManifests,
  listStrategyFiles,
  parseProjectManifest,
  parseStrategyHeader,
} from "./discover.utils";

/**
 * Discover all available strategies on disk.
 *
 * Returns schema-validated strategies plus warnings for any candidate
 * that failed to parse or validate. See the module header for the full
 * list of sources scanned.
 *
 * @param options - Optional cwd / dataDir / includeBundled overrides.
 * @example
 * ```ts
 * const { strategies, warnings } = await discoverStrategies();
 * for (const s of strategies) console.log(s.label, "→", s.path);
 * ```
 */
export async function discoverStrategies(
  options: DiscoverStrategiesOptions = {},
): Promise<DiscoverStrategiesResult> {
  const cwd = options.cwd ?? process.cwd();
  const dataDir = options.dataDir ?? safeResolveDataDir();
  const includeBundled = options.includeBundled ?? true;

  const seenPaths = new Set<string>();
  const strategies: DiscoveredStrategy[] = [];
  const warnings: DiscoveryWarning[] = [];

  // Collect from a single source. Files already in `seenPaths` are skipped.
  async function collectSingleFiles(
    dir: string,
    origin: DiscoveredStrategyOrigin,
  ): Promise<void> {
    for (const path of listStrategyFiles(dir)) {
      if (seenPaths.has(path)) continue;
      const header = await parseStrategyHeader(path);
      if (!header.ok) {
        warnings.push({ path, reason: header.reason });
        continue;
      }
      seenPaths.add(path);
      strategies.push(buildDiscoveredStrategy({ header, path, origin }));
    }
  }

  async function collectProjectManifest(
    manifestPath: string,
    origin: DiscoveredStrategyOrigin,
  ): Promise<void> {
    const manifest = await parseProjectManifest(manifestPath);
    if (!manifest.ok) {
      warnings.push({ path: manifestPath, reason: manifest.reason });
      return;
    }
    for (const strategyPath of manifest.strategyPaths) {
      if (seenPaths.has(strategyPath)) continue;
      const header = await parseStrategyHeader(strategyPath);
      if (!header.ok) {
        warnings.push({ path: strategyPath, reason: header.reason });
        continue;
      }
      seenPaths.add(strategyPath);
      strategies.push(
        buildDiscoveredStrategy({
          header,
          path: strategyPath,
          origin,
          projectName: manifest.name,
          manifestPath,
        }),
      );
    }
  }

  // 1. Bundled strategies (shipped with core).
  if (includeBundled) {
    const corePackageRoot = findCorePackageRoot();
    if (corePackageRoot) {
      const bundledRoot = join(corePackageRoot, "strategies");
      // Single-file children at the bundled root.
      await collectSingleFiles(bundledRoot, "bundled");
      // Project-scoped bundled strategies.
      for (const manifestPath of listProjectManifests(bundledRoot)) {
        await collectProjectManifest(manifestPath, "bundled-project");
      }
      // Also support project subdirs that live one level under
      // `<core>/strategies/<group>/<project>/comma-project.json`. This
      // mirrors the existing "CommaAgents Strategies" layout where the
      // bundled root itself is a project dir.
      const bundledRootManifest = join(bundledRoot, "comma-project.json");
      if (existsSync(bundledRootManifest)) {
        await collectProjectManifest(bundledRootManifest, "bundled-project");
      }
    }
  }

  // 2. Cwd single-file strategies.
  const cwdStrategiesDir = join(cwd, ".comma", "strategies");
  await collectSingleFiles(cwdStrategiesDir, "cwd");

  // 3. Cwd project strategies (subdirs of `.comma/strategies/`).
  for (const manifestPath of listProjectManifests(cwdStrategiesDir)) {
    await collectProjectManifest(manifestPath, "cwd-project");
  }

  // 4. Cwd root project (`.comma/comma-project.json`).
  const cwdRootManifest = join(cwd, ".comma", "comma-project.json");
  if (existsSync(cwdRootManifest)) {
    await collectProjectManifest(cwdRootManifest, "cwd-root-project");
  }

  if (dataDir) {
    // 5. Data dir single-file strategies.
    const dataStrategiesDir = join(dataDir, "strategies");
    await collectSingleFiles(dataStrategiesDir, "data");

    // 6. Data dir project strategies.
    for (const manifestPath of listProjectManifests(dataStrategiesDir)) {
      await collectProjectManifest(manifestPath, "data-project");
    }
  }

  return { strategies, warnings };
}

/**
 * Resolve the platform data dir without crashing when the host has no
 * usable HOME directory (rare, but possible in containerized contexts).
 */
function safeResolveDataDir(): string | undefined {
  try {
    return resolveDataDir();
  } catch {
    return undefined;
  }
}
