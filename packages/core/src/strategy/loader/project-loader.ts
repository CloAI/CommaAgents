import { existsSync } from "node:fs";
import { register } from "tsx/esm/api";
import { pathToFileURL } from "node:url";
import { readFile, realpath, stat } from "node:fs/promises";
import {
  basename,
  dirname,
  extname,
  isAbsolute,
  join,
  relative,
  resolve,
} from "node:path";

import stripJsonComments from "strip-json-comments";
import YAML from "yaml";

import { StrategyValidationError } from "../../errors/index";
import {
  type CommaProjectManifest,
  CommaProjectManifestSchema,
} from "../../hub";
import { readStrategyFile } from "../discover/discover.utils";
import { StrategySchema } from "../schema";

let registeredTypeScriptLoader = false;

const FILESYSTEM_TOOLS = new Set([
  "read_file",
  "list_directory",
  "search_files",
  "glob",
  "create_file",
  "write_file",
  "edit_file",
  "delete_file",
  "restore_file",
  "move_file",
]);

/** A validated project manifest and its location on disk. */
export interface LoadedProject {
  /** Project name displayed with its discovered strategies. */
  readonly name: string;
  /** Optional project version from the manifest. */
  readonly version?: string;
  /** Optional project description from the manifest. */
  readonly description?: string;
  /** Validated project manifest. */
  readonly manifest: CommaProjectManifest;
  /** Absolute directory containing the manifest. */
  readonly manifestDir: string;
}

async function resolveProjectFile(
  manifestDir: string,
  declaredPath: string,
  label: string,
): Promise<string> {
  if (isAbsolute(declaredPath)) {
    throw new StrategyValidationError(
      `${label} must use a relative path: ${declaredPath}`,
    );
  }
  const candidate = resolve(manifestDir, declaredPath);
  const lexicalRelative = relative(manifestDir, candidate);
  if (lexicalRelative.startsWith("..") || isAbsolute(lexicalRelative)) {
    throw new StrategyValidationError(
      `${label} escapes the project directory: ${declaredPath}`,
    );
  }

  let resolvedPath: string;
  try {
    resolvedPath = await realpath(candidate);
  } catch {
    throw new StrategyValidationError(`${label} not found: ${candidate}`);
  }
  const realManifestDir = await realpath(manifestDir);
  const realRelative = relative(realManifestDir, resolvedPath);
  if (realRelative.startsWith("..") || isAbsolute(realRelative)) {
    throw new StrategyValidationError(
      `${label} escapes the project directory: ${declaredPath}`,
    );
  }
  if (!(await stat(resolvedPath)).isFile()) {
    throw new StrategyValidationError(
      `${label} must be a regular file: ${candidate}`,
    );
  }
  if (!existsSync(resolvedPath)) {
    throw new StrategyValidationError(`${label} not found: ${candidate}`);
  }
  return resolvedPath;
}

/**
 * Reject module formats that can load a second CommonJS copy of the core registries.
 * @param {string} filePath - Resolved executable project module path.
 * @returns {Promise<void>} Resolves when the module declares ESM semantics.
 */
async function assertProjectModuleIsEsm(filePath: string): Promise<void> {
  const extension = extname(filePath);
  if (extension === ".mts" || extension === ".mjs") {
    return;
  }
  if ([".ts", ".tsx", ".js", ".jsx"].includes(extension)) {
    let directory = dirname(filePath);
    while (true) {
      const packagePath = join(directory, "package.json");
      if (existsSync(packagePath)) {
        const packageManifest = JSON.parse(
          await readFile(packagePath, "utf8"),
        ) as {
          type?: unknown;
        } | null;
        if (packageManifest?.type === "module") {
          return;
        }
        break;
      }
      const parentDirectory = dirname(directory);
      if (
        parentDirectory === directory ||
        basename(directory) === "node_modules"
      ) {
        break;
      }
      directory = parentDirectory;
    }
  }
  throw new StrategyValidationError(
    `Executable project module "${filePath}" must use ESM. Use .mts or .mjs, or set {"type":"module"} in the nearest package.json for .ts, .tsx, .js, or .jsx modules. Convert .cts and .cjs modules to ESM; CommonJS can create separate CommaAgents registries.`,
  );
}

async function importProjectFile(
  filePath: string,
  label: string,
): Promise<void> {
  try {
    await assertProjectModuleIsEsm(filePath);
    if (!registeredTypeScriptLoader) {
      register();
      registeredTypeScriptLoader = true;
    }
    await import(pathToFileURL(filePath).href);
  } catch (importError) {
    throw new StrategyValidationError(
      `Failed to import ${label} "${filePath}": ${importError instanceof Error ? importError.message : String(importError)}`,
      { cause: importError },
    );
  }
}

export async function loadProject(
  manifestPath: string,
): Promise<LoadedProject> {
  if (!existsSync(manifestPath)) {
    throw new StrategyValidationError(
      `Project manifest not found: ${manifestPath}`,
    );
  }

  const content = await readFile(manifestPath, "utf8");
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

  if (
    (manifest.entry ||
      Object.keys(manifest.tools ?? {}).length > 0 ||
      Object.keys(manifest.flows ?? {}).length > 0) &&
    manifest.permissions?.executesCode !== true
  ) {
    throw new StrategyValidationError(
      "Projects with entry, tool, or flow modules must set permissions.executesCode to true",
    );
  }

  const strategyPaths: string[] = [];
  for (const artifact of Object.values(manifest.strategies ?? {})) {
    strategyPaths.push(
      await resolveProjectFile(manifestDir, artifact.path, "Strategy file"),
    );
  }
  for (const artifact of Object.values(manifest.agents ?? {})) {
    await resolveProjectFile(manifestDir, artifact.path, "Agent file");
  }

  const usedTools = new Set<string>();
  for (const strategyPath of strategyPaths) {
    const strategyFile = await readStrategyFile(strategyPath);
    const raw =
      strategyFile.format === "json"
        ? JSON.parse(stripJsonComments(strategyFile.content))
        : YAML.parse(strategyFile.content);
    const strategy = StrategySchema.safeParse(raw);
    if (!strategy.success) {
      throw new StrategyValidationError(
        `Strategy file validation failed: ${strategyPath}`,
        { cause: strategy.error },
      );
    }
    for (const agent of Object.values(strategy.data.agents)) {
      if ("tools" in agent && Array.isArray(agent.tools)) {
        for (const tool of agent.tools) {
          usedTools.add(tool);
        }
      }
    }
  }
  if (
    [...usedTools].some((tool) => FILESYSTEM_TOOLS.has(tool)) &&
    manifest.permissions?.filesystem !== true
  ) {
    throw new StrategyValidationError(
      "Project strategies use filesystem tools but permissions.filesystem is not true",
    );
  }
  if (usedTools.has("run_command") && manifest.permissions?.shell !== true) {
    throw new StrategyValidationError(
      "Project strategies use run_command but permissions.shell is not true",
    );
  }
  if (usedTools.has("webfetch") && manifest.permissions?.network !== true) {
    throw new StrategyValidationError(
      "Project strategies use webfetch but permissions.network is not true",
    );
  }

  if (manifest.entry) {
    const entryPath = await resolveProjectFile(
      manifestDir,
      manifest.entry,
      "Entry file",
    );
    await importProjectFile(entryPath, "Entry file");
  }

  if (manifest.tools) {
    for (const tool of Object.values(manifest.tools)) {
      const resolvedToolPath = await resolveProjectFile(
        manifestDir,
        tool.path,
        "Tool file",
      );
      await importProjectFile(resolvedToolPath, "Tool file");
    }
  }

  if (manifest.flows) {
    for (const flow of Object.values(manifest.flows)) {
      const resolvedFlowPath = await resolveProjectFile(
        manifestDir,
        flow.path,
        "Flow file",
      );
      await importProjectFile(resolvedFlowPath, "Flow file");
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
