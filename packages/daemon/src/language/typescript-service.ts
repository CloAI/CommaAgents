import { isAbsolute, relative, resolve } from "node:path";
import type {
  LanguageDiagnostic,
  LanguageLocation,
  LanguageRange,
  LanguageService,
  LanguageSymbol,
  LspRequest,
  LspResponse,
} from "@comma-agents/core";
import * as ts from "typescript";

export interface TypeScriptLanguageServiceOptions {
  readonly workspaceRoot: string;
}

export function createTypeScriptLanguageService(
  options: TypeScriptLanguageServiceOptions,
): LanguageService {
  const workspaceRoot = resolve(options.workspaceRoot);
  const configPath = ts.findConfigFile(
    workspaceRoot,
    ts.sys.fileExists,
    "tsconfig.json",
  );
  const project = configPath
    ? readTsConfig(configPath)
    : readInferredProject(workspaceRoot);

  const host: ts.LanguageServiceHost = {
    getCompilationSettings: () => project.options,
    getCurrentDirectory: () => workspaceRoot,
    getDefaultLibFileName: (options) => ts.getDefaultLibFilePath(options),
    getScriptFileNames: () => project.fileNames,
    getScriptVersion: () => "0",
    getScriptSnapshot: (fileName) => {
      const text = ts.sys.readFile(fileName);
      return text === undefined
        ? undefined
        : ts.ScriptSnapshot.fromString(text);
    },
    fileExists: ts.sys.fileExists,
    readFile: ts.sys.readFile,
    readDirectory: ts.sys.readDirectory,
    directoryExists: ts.sys.directoryExists,
    getDirectories: ts.sys.getDirectories,
  };

  const service = ts.createLanguageService(host, ts.createDocumentRegistry());

  return {
    languageIds: ["typescript"],
    async request(
      request: LspRequest,
      signal?: AbortSignal,
    ): Promise<LspResponse> {
      if (signal?.aborted)
        throw new DOMException("LSP request aborted", "AbortError");

      switch (request.method) {
        case "textDocument/diagnostic":
          return { diagnostics: diagnostics(request) };
        case "textDocument/hover":
          return { hover: hover(request) };
        case "textDocument/definition":
          return { locations: locationsAt(request, "definition") };
        case "textDocument/typeDefinition":
          return { locations: locationsAt(request, "typeDefinition") };
        case "textDocument/implementation":
          return { locations: locationsAt(request, "implementation") };
        case "textDocument/references":
          return { locations: references(request) };
        case "textDocument/documentSymbol":
          return { symbols: documentSymbols(request) };
        case "workspace/symbol":
          return { symbols: workspaceSymbols(request) };
      }
    },
  };

  function fileName(request: LspRequest): string | undefined {
    if (request.absolutePath) return resolve(request.absolutePath);
    if (request.path) return resolve(workspaceRoot, request.path);
    return undefined;
  }

  function sourceFile(fileName: string): ts.SourceFile | undefined {
    return service.getProgram()?.getSourceFile(fileName);
  }

  function offset(request: LspRequest, fileName: string): number {
    const source = sourceFile(fileName);
    const position = request.position;
    if (!source || !position) return 0;
    return ts.getPositionOfLineAndCharacter(
      source,
      Math.max(0, position.line - 1),
      Math.max(0, position.character - 1),
    );
  }

  function diagnostics(request: LspRequest): readonly LanguageDiagnostic[] {
    const requestedFile = fileName(request);
    const files = requestedFile ? [requestedFile] : project.fileNames;
    return files.flatMap((currentFile) =>
      [
        ...service.getSyntacticDiagnostics(currentFile),
        ...service.getSemanticDiagnostics(currentFile),
        ...service.getSuggestionDiagnostics(currentFile),
      ].map(toDiagnostic),
    );
  }

  function hover(request: LspRequest) {
    const requestedFile = fileName(request);
    if (!requestedFile) return null;
    const info = service.getQuickInfoAtPosition(
      requestedFile,
      offset(request, requestedFile),
    );
    if (!info) return null;

    const display = ts.displayPartsToString(info.displayParts ?? []);
    const docs = ts.displayPartsToString(info.documentation ?? []);
    return {
      contents: docs ? `${display}\n\n${docs}` : display,
      range: rangeOf(requestedFile, info.textSpan),
    };
  }

  function locationsAt(
    request: LspRequest,
    kind: "definition" | "typeDefinition" | "implementation",
  ): readonly LanguageLocation[] {
    const requestedFile = fileName(request);
    if (!requestedFile) return [];
    const position = offset(request, requestedFile);
    const spans =
      kind === "definition"
        ? service.getDefinitionAtPosition(requestedFile, position)
        : kind === "typeDefinition"
          ? service.getTypeDefinitionAtPosition(requestedFile, position)
          : service.getImplementationAtPosition(requestedFile, position);
    return (spans ?? []).map((span) =>
      toLocation(span.fileName, span.textSpan),
    );
  }

  function references(request: LspRequest): readonly LanguageLocation[] {
    const requestedFile = fileName(request);
    if (!requestedFile) return [];
    return (
      service.getReferencesAtPosition(
        requestedFile,
        offset(request, requestedFile),
      ) ?? []
    ).map((span) => toLocation(span.fileName, span.textSpan));
  }

  function documentSymbols(request: LspRequest): readonly LanguageSymbol[] {
    const requestedFile = fileName(request);
    if (!requestedFile) return [];
    const tree = service.getNavigationTree(requestedFile);
    const symbols: LanguageSymbol[] = [];

    function visit(item: ts.NavigationTree, containerName?: string): void {
      const span = item.spans[0];
      if (item.kind !== "script" && span) {
        symbols.push({
          name: item.text,
          kind: item.kind,
          path: toWorkspacePath(requestedFile),
          range: rangeOf(requestedFile, span),
          ...(containerName ? { containerName } : {}),
        });
      }
      for (const child of item.childItems ?? []) {
        visit(child, item.kind === "script" ? undefined : item.text);
      }
    }

    visit(tree);
    return symbols;
  }

  function workspaceSymbols(request: LspRequest): readonly LanguageSymbol[] {
    const query = request.query ?? "";
    return (service.getNavigateToItems(query, 256) ?? [])
      .map((item) => ({
        name: item.name,
        kind: item.kind,
        path: toWorkspacePath(item.fileName),
        range: rangeOf(item.fileName, item.textSpan),
        ...(item.containerName ? { containerName: item.containerName } : {}),
      }))
      .filter((symbol) => !isAbsolute(symbol.path))
      .filter((symbol) =>
        query ? symbol.name.toLowerCase().includes(query.toLowerCase()) : true,
      );
  }

  function toLocation(fileName: string, span: ts.TextSpan): LanguageLocation {
    return { path: toWorkspacePath(fileName), range: rangeOf(fileName, span) };
  }

  function toDiagnostic(diagnostic: ts.Diagnostic): LanguageDiagnostic {
    const diagnosticFile = diagnostic.file?.fileName ?? workspaceRoot;
    return {
      path: toWorkspacePath(diagnosticFile),
      range: rangeOf(diagnosticFile, {
        start: diagnostic.start ?? 0,
        length: diagnostic.length ?? 0,
      }),
      severity: diagnosticSeverity(diagnostic.category),
      message: ts.flattenDiagnosticMessageText(diagnostic.messageText, "\n"),
      code: diagnostic.code,
      source: "typescript",
    };
  }

  function rangeOf(fileName: string, span: ts.TextSpan): LanguageRange {
    const source = sourceFile(fileName);
    if (!source) {
      return {
        startLine: 1,
        startCharacter: 1,
        endLine: 1,
        endCharacter: 1,
      };
    }
    const start = source.getLineAndCharacterOfPosition(span.start);
    const end = source.getLineAndCharacterOfPosition(span.start + span.length);
    return {
      startLine: start.line + 1,
      startCharacter: start.character + 1,
      endLine: end.line + 1,
      endCharacter: end.character + 1,
    };
  }

  function toWorkspacePath(fileName: string): string {
    const rel = relative(workspaceRoot, fileName);
    return rel.length === 0 ||
      rel === ".." ||
      rel.startsWith("../") ||
      isAbsolute(rel)
      ? fileName
      : rel;
  }
}

function readTsConfig(configPath: string): ts.ParsedCommandLine {
  const config = ts.readConfigFile(configPath, ts.sys.readFile);
  if (config.error) {
    throw new Error(
      ts.flattenDiagnosticMessageText(config.error.messageText, "\n"),
    );
  }
  return ts.parseJsonConfigFileContent(
    config.config,
    ts.sys,
    resolve(configPath, ".."),
  );
}

function readInferredProject(workspaceRoot: string): ts.ParsedCommandLine {
  return {
    options: {
      allowJs: true,
      checkJs: false,
      jsx: ts.JsxEmit.ReactJSX,
      module: ts.ModuleKind.ESNext,
      moduleResolution: ts.ModuleResolutionKind.Bundler,
      target: ts.ScriptTarget.ES2022,
    },
    fileNames: ts.sys.readDirectory(
      workspaceRoot,
      [".ts", ".tsx", ".js", ".jsx"],
      ["node_modules", "dist", "build", ".git"],
    ),
    errors: [],
  };
}

function diagnosticSeverity(
  category: ts.DiagnosticCategory,
): LanguageDiagnostic["severity"] {
  switch (category) {
    case ts.DiagnosticCategory.Error:
      return "error";
    case ts.DiagnosticCategory.Warning:
      return "warning";
    case ts.DiagnosticCategory.Suggestion:
      return "hint";
    case ts.DiagnosticCategory.Message:
      return "information";
  }
}
