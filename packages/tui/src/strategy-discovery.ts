import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { resolveDataDir } from "@comma-agents/core";

import type { StrategyOption } from "./components/StrategyPicker";

function parseStrategyName(filePath: string): string {
  try {
    const raw = JSON.parse(readFileSync(filePath, "utf8"));
    return typeof raw.name === "string" && raw.name.length > 0
      ? raw.name
      : basename(filePath);
  } catch {
    return basename(filePath);
  }
}

function basename(filePath: string): string {
  return (
    filePath
      .split("/")
      .pop()
      ?.replace(/\.json$/, "") ?? filePath
  );
}

function scanJsonFiles(dir: string): string[] {
  if (!existsSync(dir)) return [];
  try {
    return readdirSync(dir, { withFileTypes: true })
      .filter((e) => e.isFile() && e.name.endsWith(".json"))
      .map((e) => join(dir, e.name));
  } catch {
    return [];
  }
}

function filesToOptions(files: string[]): StrategyOption[] {
  return files.map((absPath) => ({
    label: parseStrategyName(absPath),
    value: absPath,
    description: "",
  }));
}

/** Find subdirectories containing a comma-project.json manifest. */
function scanProjectDirs(dir: string): string[] {
  if (!existsSync(dir)) return [];
  try {
    return readdirSync(dir, { withFileTypes: true })
      .filter(
        (e) =>
          e.isDirectory() &&
          existsSync(join(dir, e.name, "comma-project.json")),
      )
      .map((e) => join(dir, e.name, "comma-project.json"));
  } catch {
    return [];
  }
}

/**
 * Parse a project manifest and return StrategyOption entries for each strategy,
 * with manifestPath set so the daemon knows to load the project first.
 */
function projectToOptions(manifestPath: string): StrategyOption[] {
  try {
    const raw = JSON.parse(readFileSync(manifestPath, "utf8"));
    const projectName: string = raw.name ?? basename(dirname(manifestPath));
    const strategies: string[] = Array.isArray(raw.strategies)
      ? raw.strategies
      : [];
    const manifestDir = dirname(manifestPath);

    return strategies.map((relativePath) => {
      const absPath = resolve(manifestDir, relativePath);
      let label: string;
      try {
        const strategyRaw = JSON.parse(readFileSync(absPath, "utf8"));
        label =
          typeof strategyRaw.name === "string" && strategyRaw.name.length > 0
            ? `${projectName} > ${strategyRaw.name}`
            : `${projectName} > ${basename(absPath)}`;
      } catch {
        label = `${projectName} > ${basename(absPath)}`;
      }
      return {
        label,
        value: absPath,
        description: "",
        manifestPath,
      };
    });
  } catch {
    return [];
  }
}

const BUNDLED_DIR = join(import.meta.dir, "..", "strategies");

function getCwdCommaDir(): string | null {
  try {
    return join(process.cwd(), ".comma");
  } catch {
    return null;
  }
}

function getCwdStrategiesDir(): string | null {
  try {
    return join(process.cwd(), ".comma", "strategies");
  } catch {
    return null;
  }
}

function getDataStrategiesDir(): string | null {
  try {
    return join(resolveDataDir(), "strategies");
  } catch {
    return null;
  }
}

/**
 * Discover available strategies from multiple locations:
 *
 * 1. Bundled strategies (single-file) — `packages/tui/strategies/*.json`
 * 2. Bundled projects — `packages/tui/strategies/<project>/comma-project.json`
 * 3. cwd single-file strategies — `<cwd>/.comma/strategies/*.json`
 * 4. cwd project strategies — `<cwd>/.comma/strategies/<project>/comma-project.json`
 * 5. cwd root project — `<cwd>/.comma/comma-project.json`
 * 6. Data dir single-file strategies — `<resolveDataDir()>/strategies/*.json`
 * 7. Data dir project strategies — `<resolveDataDir()>/strategies/<project>/comma-project.json`
 *
 * Duplicate names are deduplicated: earlier sources take priority.
 */
export function discoverStrategies(): readonly StrategyOption[] {
  const seen = new Set<string>();

  // 1. Bundled strategies (single-file)
  const bundledFiles = scanJsonFiles(BUNDLED_DIR);
  const bundled = filesToOptions(bundledFiles).filter((s) => {
    if (seen.has(s.label)) return false;
    seen.add(s.label);
    return true;
  });

  // 2. Bundled projects (subdirectories of bundled dir)
  const bundledProjectManifests = scanProjectDirs(BUNDLED_DIR);
  const bundledProjects = bundledProjectManifests.flatMap((manifestPath) =>
    projectToOptions(manifestPath).filter((s) => {
      if (seen.has(s.label)) return false;
      seen.add(s.label);
      return true;
    }),
  );

  // 3. cwd single-file strategies
  const cwdDir = getCwdStrategiesDir();
  const cwd = cwdDir
    ? filesToOptions(scanJsonFiles(cwdDir)).filter((s) => {
        if (seen.has(s.label)) return false;
        seen.add(s.label);
        return true;
      })
    : [];

  // 4. cwd project strategies (subdirectories of .comma/strategies/)
  const cwdProjectDir = getCwdStrategiesDir();
  const cwdProjectManifests = cwdProjectDir
    ? scanProjectDirs(cwdProjectDir)
    : [];
  const cwdProjects = cwdProjectManifests.flatMap((manifestPath) =>
    projectToOptions(manifestPath).filter((s) => {
      if (seen.has(s.label)) return false;
      seen.add(s.label);
      return true;
    }),
  );

  // 5. cwd root project (.comma/comma-project.json)
  const cwdCommaDir = getCwdCommaDir();
  const cwdRootProject: StrategyOption[] = (() => {
    if (!cwdCommaDir) return [];
    const rootManifest = join(cwdCommaDir, "comma-project.json");
    if (!existsSync(rootManifest)) return [];
    return projectToOptions(rootManifest).filter((s) => {
      if (seen.has(s.label)) return false;
      seen.add(s.label);
      return true;
    });
  })();

  // 6. Data dir single-file strategies
  const dataDir = getDataStrategiesDir();
  const data = dataDir
    ? filesToOptions(scanJsonFiles(dataDir)).filter((s) => {
        if (seen.has(s.label)) return false;
        seen.add(s.label);
        return true;
      })
    : [];

  // 7. Data dir project strategies
  const dataProjectDir = getDataStrategiesDir();
  const dataProjectManifests = dataProjectDir
    ? scanProjectDirs(dataProjectDir)
    : [];
  const dataProjects = dataProjectManifests.flatMap((manifestPath) =>
    projectToOptions(manifestPath).filter((s) => {
      if (seen.has(s.label)) return false;
      seen.add(s.label);
      return true;
    }),
  );

  return [
    ...bundled,
    ...bundledProjects,
    ...cwd,
    ...cwdProjects,
    ...cwdRootProject,
    ...data,
    ...dataProjects,
  ];
}
