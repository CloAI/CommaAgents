import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { PUBLIC_PACKAGE_DIRECTORIES } from "./release-version.constants";
import { collectReleaseManifestErrors } from "./release-version.utils";

const repositoryRoot = resolve(import.meta.dir, "..");
const rootManifestPath = join(repositoryRoot, "package.json");
const rootManifest = await Bun.file(rootManifestPath).json();
const publicManifestEntries = PUBLIC_PACKAGE_DIRECTORIES.map(
  (packageDirectory) => {
    const path = join(
      repositoryRoot,
      "packages",
      packageDirectory,
      "package.json",
    );
    return { path, contents: readFileSync(path, "utf8") };
  },
);
const errors = [
  ...collectReleaseManifestErrors(
    { path: rootManifestPath, contents: readFileSync(rootManifestPath, "utf8") },
    publicManifestEntries,
  ),
];
const privateUtilsImportPattern =
  /(?:from\s*["']@comma-agents\/utils["']|import\s*\(\s*["']@comma-agents\/utils["']\s*\)|require\s*\(\s*["']@comma-agents\/utils["']\s*\))/;

function walk(directory: string): Array<string> {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    return entry.isDirectory() ? walk(path) : [path];
  });
}

for (const packageName of PUBLIC_PACKAGE_DIRECTORIES) {
  const packageDirectory = join(repositoryRoot, "packages", packageName);
  const manifest = await Bun.file(join(packageDirectory, "package.json")).json();

  const distDirectory = join(packageDirectory, "dist");
  if (!existsSync(distDirectory)) {
    errors.push(`${manifest.name} has no dist directory`);
    continue;
  }

  for (const path of walk(distDirectory)) {
    if (!/\.(?:js|d\.ts)$/.test(path)) continue;
    const contents = readFileSync(path, "utf8");
    if (privateUtilsImportPattern.test(contents)) {
      errors.push(`${path} references private @comma-agents/utils`);
    }
  }

  for (const binPath of Object.values(manifest.bin ?? {})) {
    if (!existsSync(join(packageDirectory, String(binPath)))) {
      errors.push(`${manifest.name} bin does not exist: ${binPath}`);
    }
  }
}

if (errors.length > 0) {
  throw new Error(`Public package validation failed:\n- ${errors.join("\n- ")}`);
}

console.log(
  `Validated ${PUBLIC_PACKAGE_DIRECTORIES.length} public packages at ${rootManifest.version}.`,
);
