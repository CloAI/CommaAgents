import { existsSync } from "node:fs";
import { isAbsolute, join, relative } from "node:path";
import * as typescript from "typescript";
import type { server } from "typescript";
import type {
  LanguageDiagnostic,
  LanguageLocation,
  LanguageRange,
  LanguageSymbol,
} from "@comma-agents/core/language";
import type { TypeScriptProject } from "./typescript.types";

/**
 * Read the cwd's root project, including source directories selected by its config.
 * @param {string} cwd - Root working directory.
 * @returns {TypeScriptProject} Compiler settings and saved project files.
 * @internal
 */
export function readRootProject(cwd: string): TypeScriptProject {
  // TODO: Add bounded nested-project discovery with directory exclusions and recursion limits.
  const configPath = [
    join(cwd, "tsconfig.json"),
    join(cwd, "jsconfig.json"),
  ].find((path) => existsSync(path));
  if (configPath) {
    const config = typescript.readConfigFile(
      configPath,
      typescript.sys.readFile,
    );
    if (config.error) {
      throw new Error(
        typescript.flattenDiagnosticMessageText(config.error.messageText, "\n"),
      );
    }
    const rawConfig: unknown = config.config;
    const project = typescript.parseJsonConfigFileContent(
      rawConfig,
      typescript.sys,
      cwd,
      configPath.endsWith("jsconfig.json") ? { allowJs: true } : {},
      configPath,
    );
    const errors = project.errors.filter(
      (error) => error.code !== 18003 && error.code !== 18002,
    );
    if (errors.length > 0) {
      throw new Error(
        errors
          .map((error) =>
            typescript.flattenDiagnosticMessageText(error.messageText, "\n"),
          )
          .join("\n"),
      );
    }
    return { fileNames: project.fileNames, options: project.options };
  }
  return {
    fileNames: typescript.sys.readDirectory(
      cwd,
      [".ts", ".tsx", ".js", ".jsx"],
      ["node_modules", "dist", "build", ".git"],
      undefined,
      1,
    ),
    options: {
      allowJs: true,
      checkJs: false,
      jsx: typescript.JsxEmit.ReactJSX,
      module: typescript.ModuleKind.ESNext,
      moduleResolution: typescript.ModuleResolutionKind.Bundler,
      target: typescript.ScriptTarget.ES2022,
    },
  };
}

/**
 * Convert protocol coordinates to a one-indexed language range.
 * @param {server.protocol.TextSpan} span - Protocol source span.
 * @returns {LanguageRange} Language API range.
 * @internal
 */
export function toLanguageRange(span: server.protocol.TextSpan): LanguageRange {
  return {
    startLine: span.start.line,
    startCharacter: span.start.offset,
    endLine: span.end.line,
    endCharacter: span.end.offset,
  };
}

/**
 * Prefer workspace-relative result paths, retaining external dependency paths.
 * @param {string} cwd - Workspace directory.
 * @param {string} path - Absolute result path.
 * @returns {string} Relative workspace path or absolute dependency path.
 * @internal
 */
export function toLanguagePath(cwd: string, path: string): string {
  const localPath = relative(cwd, path);
  if (
    isAbsolute(localPath) ||
    localPath === ".." ||
    localPath.startsWith("../")
  ) {
    return path;
  }
  return localPath;
}

/**
 * Translate one protocol definition or reference location.
 * @param {string} cwd - Workspace directory.
 * @param {server.protocol.FileSpan} span - Protocol file location.
 * @returns {LanguageLocation} Language API location.
 * @internal
 */
export function toLanguageLocation(
  cwd: string,
  span: server.protocol.FileSpan,
): LanguageLocation {
  return { path: toLanguagePath(cwd, span.file), range: toLanguageRange(span) };
}

/**
 * Translate a diagnostic without exposing TypeScript protocol objects.
 * @param {string} cwd - Workspace directory.
 * @param {string} file - Diagnosed file path.
 * @param {server.protocol.Diagnostic} diagnostic - Protocol diagnostic.
 * @returns {LanguageDiagnostic} Language API diagnostic.
 * @internal
 */
export function toLanguageDiagnostic(
  cwd: string,
  file: string,
  diagnostic: server.protocol.Diagnostic,
): LanguageDiagnostic {
  const severity =
    diagnostic.category === "error"
      ? "error"
      : diagnostic.category === "warning"
        ? "warning"
        : diagnostic.category === "suggestion"
          ? "hint"
          : "information";
  return {
    path: toLanguagePath(cwd, file),
    range: toLanguageRange(diagnostic),
    severity,
    message: diagnostic.text,
    code: diagnostic.code,
    source: diagnostic.source ?? "typescript",
  };
}

/**
 * Flatten document navigation nodes into language symbols.
 * @param {string} cwd - Workspace directory.
 * @param {string} file - Document path.
 * @param {server.protocol.NavigationTree} tree - Protocol navigation tree.
 * @returns {readonly LanguageSymbol[]} Flattened language symbols.
 * @internal
 */
export function toDocumentSymbols(
  cwd: string,
  file: string,
  tree: server.protocol.NavigationTree,
): readonly LanguageSymbol[] {
  const symbols: LanguageSymbol[] = [];
  function visit(
    node: server.protocol.NavigationTree,
    containerName?: string,
  ): void {
    const span = node.spans[0];
    if (node.kind !== "script" && span) {
      symbols.push({
        name: node.text,
        kind: node.kind,
        path: toLanguagePath(cwd, file),
        range: toLanguageRange(span),
        ...(containerName ? { containerName } : {}),
      });
    }
    for (const child of node.childItems ?? []) {
      visit(child, node.kind === "script" ? undefined : node.text);
    }
  }
  visit(tree);
  return symbols;
}
