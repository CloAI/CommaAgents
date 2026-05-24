import { dirname, resolve } from "node:path";

import stripJsonComments from "strip-json-comments";

import { StrategyValidationError } from "../../errors/index";
import type { CommaProjectManifest } from "../schema";
import { CommaProjectManifestSchema } from "../schema";

export interface LoadedProject {
  readonly name: string;
  readonly version?: string;
  readonly description?: string;
  readonly manifest: CommaProjectManifest;
  readonly manifestDir: string;
}

async function importIfExists(filePath: string, label: string): Promise<void> {
  const file = Bun.file(filePath);
  if (!(await file.exists())) {
    throw new StrategyValidationError(`${label} not found: ${filePath}`);
  }
  try {
    await import(filePath);
  } catch (importError) {
    throw new StrategyValidationError(
      `Failed to import ${label} "${filePath}": ${importError instanceof Error ? importError.message : String(importError)}`,
      { cause: importError },
    );
  }
}

async function importIfPresent(filePath: string): Promise<void> {
  const file = Bun.file(filePath);
  if (!(await file.exists())) return;
  try {
    await import(filePath);
  } catch (importError) {
    throw new StrategyValidationError(
      `Failed to import "${filePath}": ${importError instanceof Error ? importError.message : String(importError)}`,
      { cause: importError },
    );
  }
}

export async function loadProject(
  manifestPath: string,
): Promise<LoadedProject> {
  const file = Bun.file(manifestPath);
  if (!(await file.exists())) {
    throw new StrategyValidationError(
      `Project manifest not found: ${manifestPath}`,
    );
  }

  const content = await file.text();
  let raw: unknown;
  try {
    raw = JSON.parse(stripJsonComments(content));
  } catch (parseError) {
    throw new StrategyValidationError(
      `Failed to parse comma-project.json: ${parseError instanceof Error ? parseError.message : String(parseError)}`,
      { cause: parseError },
    );
  }

  const result = CommaProjectManifestSchema.safeParse(raw);
  if (!result.success) {
    const issues = result.error.issues
      .map((issue) => `  - ${issue.path.join(".")}: ${issue.message}`)
      .join("\n");
    throw new StrategyValidationError(
      `Project manifest validation failed:\n${issues}`,
      { cause: result.error },
    );
  }

  const manifest = result.data;
  const manifestDir = dirname(manifestPath);

  if (manifest.entry) {
    const entryPath = resolve(manifestDir, manifest.entry);
    await importIfExists(entryPath, "Entry file");
  } else {
    const defaultEntryPath = resolve(manifestDir, "index.ts");
    await importIfPresent(defaultEntryPath);
  }

  if (manifest.tools) {
    for (const toolPath of manifest.tools) {
      const resolvedToolPath = resolve(manifestDir, toolPath);
      await importIfExists(resolvedToolPath, "Tool file");
    }
  }

  return {
    name: manifest.name,
    version: manifest.version,
    description: manifest.description,
    manifest,
    manifestDir,
  };
}
