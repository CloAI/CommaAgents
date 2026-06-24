// Strategy discovery — utility helpers.
//
// Find candidate strategy files on disk and validate them against
// `StrategySchema` / `CommaProjectManifestSchema`. All helpers are pure
// over the filesystem (no caching, no side effects).

import { existsSync, readdirSync } from "node:fs";
import { realpath, stat } from "node:fs/promises";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";

import stripJsonComments from "strip-json-comments";
import YAML from "yaml";

import { CommaProjectManifestSchema } from "../../hub";
import { StrategySchema } from "../schema";
import type {
  DiscoveredStrategy,
  DiscoveredStrategyOrigin,
} from "./discover.types";

/** Recognized strategy file extensions (case-insensitive). */
const STRATEGY_EXTENSIONS = [".json", ".jsonc", ".yaml", ".yml"] as const;

/**
 * Internal: parse outcome — either a validated strategy header, or a
 * reason it was skipped. Helpers return these so the caller can collect
 * warnings centrally.
 */
export type ParsedStrategyHeader =
  | {
      readonly ok: true;
      readonly name: string;
      readonly version: string;
      readonly description: string | undefined;
    }
  | { readonly ok: false; readonly reason: string };

/** Internal: parse outcome for a project manifest. */
export type ParsedProjectManifest =
  | {
      readonly ok: true;
      readonly name: string;
      readonly description: string | undefined;
      /** Absolute paths of every strategy file referenced by this manifest. */
      readonly strategyPaths: readonly string[];
    }
  | { readonly ok: false; readonly reason: string };

/** Return `true` when `filePath` ends with one of {@link STRATEGY_EXTENSIONS}. */
export function hasStrategyExtension(filePath: string): boolean {
  const lower = filePath.toLowerCase();
  return STRATEGY_EXTENSIONS.some((ext) => lower.endsWith(ext));
}

/**
 * Resolve a strategy file's parse format from its extension.
 *
 * `.json` / `.jsonc` parse as JSON (comments stripped); `.yaml` / `.yml`
 * parse as YAML. Throws when the extension is unrecognized — callers
 * should gate via {@link hasStrategyExtension} first.
 */
export function formatForExtension(filePath: string): "json" | "yaml" {
  const lower = filePath.toLowerCase();
  if (lower.endsWith(".json") || lower.endsWith(".jsonc")) return "json";
  if (lower.endsWith(".yaml") || lower.endsWith(".yml")) return "yaml";
  throw new Error(`Unrecognized strategy extension: ${filePath}`);
}

/**
 * Read a strategy file from disk and return its raw text plus the
 * detected parse format (based on extension).
 *
 * Exposed from core so the daemon executor can reuse the same logic
 * without re-implementing JSON/YAML detection or comment stripping.
 *
 * @throws when the file does not exist or has an unsupported extension.
 */
export async function readStrategyFile(filePath: string): Promise<{
  readonly content: string;
  readonly format: "json" | "yaml";
}> {
  if (!hasStrategyExtension(filePath)) {
    const ext = filePath.split(".").pop()?.toLowerCase() ?? "";
    throw new Error(
      `Unsupported strategy file extension: .${ext}. Use .json, .jsonc, .yaml, or .yml.`,
    );
  }
  const file = Bun.file(filePath);
  if (!(await file.exists())) {
    throw new Error(`Strategy file not found: ${filePath}`);
  }
  const content = await file.text();
  const format = formatForExtension(filePath);
  return { content, format };
}

/** Read a file at `filePath`, parse it according to its extension. */
async function parseFile(filePath: string): Promise<unknown> {
  const { content, format } = await readStrategyFile(filePath);
  if (format === "json") {
    return JSON.parse(stripJsonComments(content));
  }
  return YAML.parse(content);
}

/**
 * Parse a strategy file and return its validated header
 * (`name`, `version`, `description`). Failures are returned as a
 * `{ ok: false, reason }` value rather than thrown so the caller can
 * batch-collect warnings.
 */
export async function parseStrategyHeader(
  filePath: string,
): Promise<ParsedStrategyHeader> {
  let raw: unknown;
  try {
    raw = await parseFile(filePath);
  } catch (parseError) {
    return {
      ok: false,
      reason: `Parse error: ${parseError instanceof Error ? parseError.message : String(parseError)}`,
    };
  }
  const result = StrategySchema.safeParse(raw);
  if (!result.success) {
    const firstIssue = result.error.issues[0];
    const detail = firstIssue
      ? `${firstIssue.path.join(".")}: ${firstIssue.message}`
      : "validation failed";
    return { ok: false, reason: `Schema invalid (${detail})` };
  }
  return {
    ok: true,
    name: result.data.name,
    version: result.data.version,
    description: result.data.description,
  };
}

/**
 * Parse a `comma-project.json` manifest and return its name plus the
 * absolute paths of every strategy it references. Strategy entries in
 * the manifest are resolved relative to the manifest's directory.
 */
export async function parseProjectManifest(
  manifestPath: string,
): Promise<ParsedProjectManifest> {
  let raw: unknown;
  try {
    raw = await parseFile(manifestPath);
  } catch (parseError) {
    return {
      ok: false,
      reason: `Parse error: ${parseError instanceof Error ? parseError.message : String(parseError)}`,
    };
  }
  const result = CommaProjectManifestSchema.safeParse(raw);
  if (!result.success) {
    const firstIssue = result.error.issues[0];
    const detail = firstIssue
      ? `${firstIssue.path.join(".")}: ${firstIssue.message}`
      : "validation failed";
    return { ok: false, reason: `Manifest invalid (${detail})` };
  }
  const manifestDir = dirname(manifestPath);
  const strategyPaths: string[] = [];
  let realManifestDir: string;
  try {
    realManifestDir = await realpath(manifestDir);
    for (const entry of Object.values(result.data.strategies ?? {})) {
      if (entry.expose !== true) continue;
      if (isAbsolute(entry.path)) {
        return {
          ok: false,
          reason: `Strategy path must be relative: ${entry.path}`,
        };
      }
      const candidate = resolve(manifestDir, entry.path);
      const lexicalRelative = relative(manifestDir, candidate);
      if (lexicalRelative.startsWith("..") || isAbsolute(lexicalRelative)) {
        return {
          ok: false,
          reason: `Strategy path escapes project: ${entry.path}`,
        };
      }
      const resolvedPath = await realpath(candidate);
      const realRelative = relative(realManifestDir, resolvedPath);
      if (realRelative.startsWith("..") || isAbsolute(realRelative)) {
        return {
          ok: false,
          reason: `Strategy path escapes project: ${entry.path}`,
        };
      }
      if (!(await stat(resolvedPath)).isFile()) {
        return {
          ok: false,
          reason: `Strategy path is not a regular file: ${entry.path}`,
        };
      }
      strategyPaths.push(candidate);
    }
  } catch (error) {
    return {
      ok: false,
      reason: `Strategy path is missing or unreadable: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
  return {
    ok: true,
    name: result.data.name,
    description: result.data.description,
    strategyPaths,
  };
}

/** List strategy files directly inside `dir` (non-recursive). */
export function listStrategyFiles(dir: string): string[] {
  if (!existsSync(dir)) return [];
  try {
    return readdirSync(dir, { withFileTypes: true })
      .filter((entry) => entry.isFile() && hasStrategyExtension(entry.name))
      .map((entry) => join(dir, entry.name));
  } catch {
    return [];
  }
}

/**
 * List `<dir>/<child>/comma-project.json` manifest paths for every
 * subdirectory of `dir` that contains one.
 */
export function listProjectManifests(dir: string): string[] {
  if (!existsSync(dir)) return [];
  try {
    return readdirSync(dir, { withFileTypes: true })
      .filter(
        (entry) =>
          entry.isDirectory() &&
          existsSync(join(dir, entry.name, "comma-project.json")),
      )
      .map((entry) => join(dir, entry.name, "comma-project.json"));
  } catch {
    return [];
  }
}

/** List installed Hub manifests under `<dataDir>/packages/@scope/project`. */
export function listInstalledProjectManifests(dataDir: string): string[] {
  const packagesDir = join(dataDir, "packages");
  if (!existsSync(packagesDir)) return [];
  try {
    return readdirSync(packagesDir, { withFileTypes: true })
      .filter((scope) => scope.isDirectory() && scope.name.startsWith("@"))
      .flatMap((scope) => listProjectManifests(join(packagesDir, scope.name)));
  } catch {
    return [];
  }
}

/**
 * Build a {@link DiscoveredStrategy} from a parsed strategy header.
 * Project-scoped entries get a `"<project> > <name>"` label.
 */
export function buildDiscoveredStrategy(input: {
  readonly header: Extract<ParsedStrategyHeader, { ok: true }>;
  readonly path: string;
  readonly origin: DiscoveredStrategyOrigin;
  readonly projectName?: string;
  readonly manifestPath?: string;
}): DiscoveredStrategy {
  const { header, path, origin, projectName, manifestPath } = input;
  const label = projectName ? `${projectName} > ${header.name}` : header.name;
  return {
    name: header.name,
    version: header.version,
    label,
    path,
    origin,
    ...(header.description !== undefined
      ? { description: header.description }
      : {}),
    ...(manifestPath !== undefined ? { manifestPath } : {}),
  };
}
