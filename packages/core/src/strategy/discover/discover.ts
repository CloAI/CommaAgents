// Strategy discovery — find available strategies on disk.
//
// Promoted from the TUI into core so that the new built-in
// `list_strategy` / `launch_strategy` tools and the TUI share a
// single implementation. Sources scanned (in priority order):
//
//   1. Cwd     — `<cwd>/.comma/strategies/*.{json,jsonc,yaml,yml}`
//   2. Cwd projects — `<cwd>/.comma/strategies/<project>/comma-project.json`
//   3. Cwd root project — `<cwd>/.comma/comma-project.json`
//   4. Data    — `<dataDir>/strategies/*.{json,jsonc,yaml,yml}`
//   5. Data projects — `<dataDir>/strategies/<project>/comma-project.json`
//   6. Hub packages — `<dataDir>/packages/@scope/project/comma-project.json`
//   7. Bundled defaults — Core package `strategies/@comma/core-strategies`
//
// Each candidate is parsed and validated against `StrategySchema`
// (or `CommaProjectManifestSchema` for project files). Invalid files
// are excluded from the result and surfaced in `warnings`.
//
// Discovery is duplicate-free: every entry has a unique absolute
// `path`. When the same file is reachable from multiple sources, the
// higher-priority source wins.

import { existsSync } from "node:fs";
import { isAbsolute, join, relative, resolve } from "node:path";
import stripJsonComments from "strip-json-comments";

import { resolveDataDir } from "../../data-directory";
import { CommaProjectManifestSchema } from "../../hub";
import type {
  DiscoveredStrategy,
  DiscoveredStrategyOrigin,
  DiscoverStrategiesOptions,
  DiscoverStrategiesResult,
  DiscoveryWarning,
} from "./discover.types";
import {
  buildDiscoveredStrategy,
  listInstalledProjectManifests,
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
 * @param options - Optional cwd and dataDir overrides.
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

  // 1. Cwd single-file strategies.
  const cwdStrategiesDir = join(cwd, ".comma", "strategies");
  await collectSingleFiles(cwdStrategiesDir, "cwd");

  // 2. Cwd project strategies (subdirs of `.comma/strategies/`).
  for (const manifestPath of listProjectManifests(cwdStrategiesDir)) {
    await collectProjectManifest(manifestPath, "cwd-project");
  }

  // 3. Cwd root project (`.comma/comma-project.json`).
  const cwdRootManifest = join(cwd, ".comma", "comma-project.json");
  if (existsSync(cwdRootManifest)) {
    await collectProjectManifest(cwdRootManifest, "cwd-root-project");
  }

  if (dataDir) {
    // 4. Data dir single-file strategies.
    const dataStrategiesDir = join(dataDir, "strategies");
    await collectSingleFiles(dataStrategiesDir, "data");

    // 5. Data dir project strategies.
    for (const manifestPath of listProjectManifests(dataStrategiesDir)) {
      await collectProjectManifest(manifestPath, "data-project");
    }

    // 6. Exposed strategies from installed Hub packages.
    for (const manifestPath of listInstalledProjectManifests(dataDir)) {
      await collectProjectManifest(manifestPath, "hub-package");
    }
  }

  // 7. Bundled official strategies. Kept last so user/workspace/installed
  // strategies can intentionally shadow default strategy names.
  if (includeBundled) {
    for (const manifestPath of getBundledProjectManifestCandidates()) {
      if (!existsSync(manifestPath)) continue;
      await collectProjectManifest(manifestPath, "bundled");
      break;
    }
  }

  return { strategies, warnings };
}

/**
 * Resolve an installed package strategy reference, including internal artifacts.
 *
 * References use `@scope/package/strategies/artifact-id`. Internal artifacts
 * are intentionally absent from global discovery and the Hub registry, but a
 * strategy in the same installed package can launch one by this explicit ref.
 */
export async function resolveInstalledStrategyReference(
  reference: string,
  dataDir = safeResolveDataDir(),
): Promise<DiscoveredStrategy | undefined> {
  const match = /^(@[^/]+\/[^/]+)\/strategies\/([^/]+)$/.exec(reference);
  if (!match) return undefined;
  const [, packageName, artifactId] = match;
  if (!packageName || !artifactId) return undefined;

  if (dataDir) {
    const installedManifestPath = join(
      dataDir,
      "packages",
      packageName,
      "comma-project.json",
    );
    const installed = await resolveProjectStrategyReference(
      installedManifestPath,
      packageName,
      artifactId,
      "hub-package",
    );
    if (installed) return installed;
  }

  for (const manifestPath of getBundledProjectManifestCandidates()) {
    const bundled = await resolveProjectStrategyReference(
      manifestPath,
      packageName,
      artifactId,
      "bundled",
    );
    if (bundled) return bundled;
  }

  return undefined;
}

/**
 * Resolve the shared data directory without crashing when the host has no
 * usable HOME directory (rare, but possible in containerized contexts).
 */
function safeResolveDataDir(): string | undefined {
  try {
    return resolveDataDir();
  } catch {
    return undefined;
  }
}

function getBundledProjectManifestCandidates(): readonly string[] {
  return [
    // Bundled layout: packages/core/dist/index.js -> dist.
    resolve(
      import.meta.dir,
      "strategies",
      "@comma",
      "core-strategies",
      "comma-project.json",
    ),
    // Source layout: packages/core/src/strategy/discover -> packages/core.
    resolve(
      import.meta.dir,
      "..",
      "..",
      "..",
      "strategies",
      "@comma",
      "core-strategies",
      "comma-project.json",
    ),
    // Published layout: packages/core/dist/strategy/discover -> dist.
    resolve(
      import.meta.dir,
      "..",
      "..",
      "strategies",
      "@comma",
      "core-strategies",
      "comma-project.json",
    ),
  ];
}

async function resolveProjectStrategyReference(
  manifestPath: string,
  packageName: string,
  artifactId: string,
  origin: DiscoveredStrategyOrigin,
): Promise<DiscoveredStrategy | undefined> {
  if (!existsSync(manifestPath)) return undefined;

  try {
    const raw = JSON.parse(
      stripJsonComments(await Bun.file(manifestPath).text()),
    );
    const manifest = CommaProjectManifestSchema.parse(raw);
    if (manifest.name !== packageName) return undefined;
    const artifact = manifest.strategies?.[artifactId];
    if (!artifact || isAbsolute(artifact.path)) return undefined;
    const manifestDir = resolve(manifestPath, "..");
    const strategyPath = resolve(manifestDir, artifact.path);
    const rel = relative(manifestDir, strategyPath);
    if (rel.startsWith("..") || isAbsolute(rel)) return undefined;
    const header = await parseStrategyHeader(strategyPath);
    if (!header.ok) return undefined;
    return buildDiscoveredStrategy({
      header,
      path: strategyPath,
      origin,
      projectName: manifest.name,
      manifestPath,
    });
  } catch {
    return undefined;
  }
}
