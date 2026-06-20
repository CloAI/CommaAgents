import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";

const PUBLIC_PACKAGES = ["core", "daemon", "tui", "cli"] as const;
const repositoryRoot = resolve(import.meta.dir, "..");
const rootManifest = await Bun.file(join(repositoryRoot, "package.json")).json();
const errors: Array<string> = [];

function walk(directory: string): Array<string> {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    return entry.isDirectory() ? walk(path) : [path];
  });
}

for (const packageName of PUBLIC_PACKAGES) {
  const packageDirectory = join(repositoryRoot, "packages", packageName);
  const manifest = await Bun.file(join(packageDirectory, "package.json")).json();
  if (manifest.version !== rootManifest.version) {
    errors.push(`${manifest.name} is ${manifest.version}; expected ${rootManifest.version}`);
  }

  for (const group of ["dependencies", "devDependencies", "peerDependencies"]) {
    for (const [dependency, version] of Object.entries(manifest[group] ?? {})) {
      if (String(version).startsWith("workspace:")) {
        errors.push(`${manifest.name} ${group}.${dependency} uses ${version}`);
      }
    }
  }

  const distDirectory = join(packageDirectory, "dist");
  if (!existsSync(distDirectory)) {
    errors.push(`${manifest.name} has no dist directory`);
    continue;
  }

  for (const path of walk(distDirectory)) {
    if (!/\.(?:js|d\.ts)$/.test(path)) continue;
    const contents = readFileSync(path, "utf8");
    if (contents.includes("@comma-agents/utils")) {
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

console.log(`Validated ${PUBLIC_PACKAGES.length} public packages at ${rootManifest.version}.`);
