import { readFile } from "node:fs/promises";
import { isAbsolute, join, resolve } from "node:path";
import type { server } from "typescript";
import type {
  LanguageDiagnostic,
  LspRequest,
  LspResponse,
} from "@comma-agents/core/language";
import type { TypeScriptTransport } from "../../transport/transport.types";
import type { TypeScriptBackend } from "./typescript.types";
import {
  readRootProject,
  toLanguageDiagnostic,
  toLanguageLocation,
  toLanguagePath,
  toLanguageRange,
  toDocumentSymbols,
} from "./typescript.utils";

/**
 * Translate curated language operations to a root-project TypeScript server.
 * @param {string} cwd - Resolved working directory.
 * @param {TypeScriptTransport} transport - Owned protocol connection.
 * @returns {TypeScriptBackend} Saved-file synchronization and language queries.
 * @internal
 */
export function createTypeScriptBackend(
  cwd: string,
  transport: TypeScriptTransport,
): TypeScriptBackend {
  const projectName = join(cwd, ".comma-lsp-project");
  let savedFiles = new Map<string, string>();
  let projectSignature = "";
  let invalidated = false;
  let work: Promise<void> = Promise.resolve();

  async function synchronize(
    requestedFile: string | undefined,
    signal: AbortSignal,
  ): Promise<readonly string[]> {
    const project = readRootProject(cwd);
    const fileNames = new Set(project.fileNames);
    if (requestedFile) {
      fileNames.add(requestedFile);
    }
    const currentFiles = new Map<string, string>();
    for (const file of fileNames) {
      try {
        currentFiles.set(file, await readFile(file, "utf8"));
      } catch (error) {
        if (
          file === requestedFile ||
          !(error instanceof Error) ||
          !("code" in error) ||
          error.code !== "ENOENT"
        ) {
          throw error;
        }
      }
    }
    const changed = [...currentFiles].filter(
      ([file, content]) => invalidated || savedFiles.get(file) !== content,
    );
    const changedFiles = new Set(changed.map(([file]) => file));
    const closedFiles = [...savedFiles.keys()].filter(
      (file) => !currentFiles.has(file) || changedFiles.has(file),
    );
    if (closedFiles.length > 0) {
      await transport.request("updateOpen", { closedFiles }, signal);
    }
    const signature = JSON.stringify({
      files: [...currentFiles.keys()],
      options: project.options,
    });
    if (signature !== projectSignature) {
      await transport.request(
        "openExternalProject",
        {
          projectFileName: projectName,
          rootFiles: [...currentFiles.keys()].map((fileName) => ({ fileName })),
          options: project.options,
          typeAcquisition: { enable: false },
        },
        signal,
      );
    }
    if (changed.length > 0) {
      await transport.request(
        "updateOpen",
        {
          openFiles: changed.map(([file, fileContent]) => ({
            file,
            fileContent,
            projectRootPath: cwd,
          })),
        },
        signal,
      );
    }
    savedFiles = currentFiles;
    projectSignature = signature;
    invalidated = false;
    return [...currentFiles.keys()];
  }

  async function execute(
    request: LspRequest,
    signal: AbortSignal,
  ): Promise<LspResponse> {
    if (signal.aborted) {
      throw new DOMException("LSP request aborted", "AbortError");
    }
    if (
      request.languageId &&
      request.languageId !== "typescript" &&
      request.languageId !== "javascript"
    ) {
      throw new Error(`Unsupported LSP language: ${request.languageId}`);
    }
    const file = request.absolutePath
      ? resolve(request.absolutePath)
      : request.path
        ? resolve(cwd, request.path)
        : undefined;
    if (file && !/\.(?:[cm]?[jt]sx?)$/i.test(file)) {
      throw new Error(`Unsupported LSP file: ${file}`);
    }
    if (
      request.method !== "workspace/symbol" &&
      request.method !== "textDocument/diagnostic" &&
      !file
    ) {
      throw new Error(`A file is required for ${request.method}`);
    }
    const projectFiles = await synchronize(file, signal);
    const argumentsValue = {
      file,
      projectFileName: projectName,
      line: request.position?.line ?? 1,
      offset: request.position?.character ?? 1,
    };
    switch (request.method) {
      case "textDocument/diagnostic": {
        const diagnostics: LanguageDiagnostic[] = [];
        for (const currentFile of file ? [file] : projectFiles) {
          for (const command of [
            "syntacticDiagnosticsSync",
            "semanticDiagnosticsSync",
            "suggestionDiagnosticsSync",
          ]) {
            const result = await transport.request<
              server.protocol.Diagnostic[]
            >(
              command,
              { file: currentFile, projectFileName: projectName },
              signal,
            );
            diagnostics.push(
              ...(result ?? []).map((diagnostic) =>
                toLanguageDiagnostic(cwd, currentFile, diagnostic),
              ),
            );
          }
        }
        return { diagnostics };
      }
      case "textDocument/hover": {
        const info = await transport.request<
          server.protocol.QuickInfoResponseBody | undefined
        >("quickinfo", argumentsValue, signal);
        if (!info) {
          return { hover: null };
        }
        const documentation =
          typeof info.documentation === "string"
            ? info.documentation
            : info.documentation.map((part) => part.text).join("");
        return {
          hover: {
            contents: documentation
              ? `${info.displayString}\n\n${documentation}`
              : info.displayString,
            range: toLanguageRange(info),
          },
        };
      }
      case "textDocument/definition":
      case "textDocument/typeDefinition":
      case "textDocument/implementation": {
        const command =
          request.method === "textDocument/definition"
            ? "definition"
            : request.method === "textDocument/typeDefinition"
              ? "typeDefinition"
              : "implementation";
        const locations = await transport.request<
          server.protocol.FileSpan[] | undefined
        >(command, argumentsValue, signal);
        return {
          locations: (locations ?? []).map((location) =>
            toLanguageLocation(cwd, location),
          ),
        };
      }
      case "textDocument/references": {
        const references = await transport.request<
          { refs: server.protocol.FileSpan[] } | undefined
        >("references", argumentsValue, signal);
        return {
          locations: (references?.refs ?? []).map((reference) =>
            toLanguageLocation(cwd, reference),
          ),
        };
      }
      case "textDocument/documentSymbol": {
        const tree = await transport.request<
          server.protocol.NavigationTree | undefined
        >("navtree", argumentsValue, signal);
        return {
          symbols: tree && file ? toDocumentSymbols(cwd, file, tree) : [],
        };
      }
      case "workspace/symbol": {
        if (projectFiles.length === 0) {
          return { symbols: [] };
        }
        const symbols = await transport.request<
          server.protocol.NavtoItem[] | undefined
        >(
          "navto",
          {
            searchValue: request.query ?? "",
            maxResultCount: 256,
            projectFileName: projectName,
          },
          signal,
        );
        return {
          symbols: (symbols ?? [])
            .map((symbol) => ({
              name: symbol.name,
              kind: symbol.kind,
              path: toLanguagePath(cwd, symbol.file),
              range: toLanguageRange(symbol),
              ...(symbol.containerName
                ? { containerName: symbol.containerName }
                : {}),
            }))
            .filter((symbol) => !isAbsolute(symbol.path)),
        };
      }
    }
  }

  return {
    transport,
    invalidate(): void {
      invalidated = true;
    },
    request(request, signal): Promise<LspResponse> {
      const completion = work.then(() => execute(request, signal));
      work = completion.then(
        () => undefined,
        () => undefined,
      );
      return completion;
    },
  };
}
