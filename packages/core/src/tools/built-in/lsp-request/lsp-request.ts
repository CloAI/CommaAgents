import { SandboxViolationError } from "../../../errors";
import type {
  LanguageDiagnostic,
  LanguageLocation,
  LanguageRange,
  LanguageSymbol,
  LspMethod,
  LspResponse,
} from "../../../language";
import { defineTool } from "../../define/define-tool";
import { sandboxErrorToToolError } from "../../io";
import { errorResult, okResult, toolError } from "../../result";
import type { ToolContext, ToolDefinition, ToolResult } from "../../tool.types";
import { describeTool } from "../describe-tool";
import { lspRequestParams } from "./lsp-request.schema";
import type { LspRequestData } from "./lsp-request.types";

const POSITION_METHODS = new Set<LspMethod>([
  "textDocument/hover",
  "textDocument/definition",
  "textDocument/typeDefinition",
  "textDocument/implementation",
  "textDocument/references",
]);

export function createLspRequestTool(): ToolDefinition<
  typeof lspRequestParams,
  LspRequestData
> {
  return defineTool<typeof lspRequestParams, LspRequestData>({
    description: describeTool({
      purpose:
        "Run a curated read-only LSP request against the current workspace. Lifecycle, language detection, and document sync are managed by the daemon.",
      inputs: [
        {
          name: "method",
          type: "LSP method",
          required: true,
          description:
            "One of textDocument/diagnostic, hover, definition, typeDefinition, implementation, references, documentSymbol, or workspace/symbol.",
        },
        {
          name: "languageId",
          type: "string",
          required: false,
          description:
            "Optional language id such as `typescript`. Usually omit this and let the daemon route by path.",
        },
        {
          name: "path",
          type: "string",
          required: false,
          description:
            "Workspace-relative file path. Required for textDocument methods.",
        },
        {
          name: "line",
          type: "number",
          required: false,
          description:
            "1-indexed line. Required for hover/definition/typeDefinition/implementation/references.",
        },
        {
          name: "character",
          type: "number",
          required: false,
          description:
            "1-indexed character. Required for hover/definition/typeDefinition/implementation/references.",
        },
        {
          name: "query",
          type: "string",
          required: false,
          description: "Symbol query for workspace/symbol.",
        },
      ],
      outputs:
        "`{ diagnostics }`, `{ hover }`, `{ locations }`, or `{ symbols }` depending on method.",
      errors: [
        {
          kind: "language_unavailable",
          description: "The runtime did not provide an LSP service.",
        },
      ],
    }),
    systemPrompt: `### Using lsp_request

Use \`lsp_request\` when you need type-aware code intelligence instead of raw text search.

Good uses:
- \`textDocument/diagnostic\`: find TypeScript errors or warnings in a file or workspace.
- \`textDocument/hover\`: inspect the type/signature/documentation of a symbol.
- \`textDocument/definition\`, \`textDocument/typeDefinition\`, \`textDocument/implementation\`: jump to related declarations.
- \`textDocument/references\`: find type-aware usages of a symbol.
- \`textDocument/documentSymbol\`: summarize symbols in a file.
- \`workspace/symbol\`: search symbols by name across the workspace.

Use \`read_file\` or \`search_files\` for raw text inspection. Use \`lsp_request\` when symbol identity, types, or compiler diagnostics matter.

Positions are 1-indexed: line 1, character 1 is the first character of the file. The daemon chooses the language service from the file path/workspace; only pass \`languageId\` when you need to disambiguate.`,
    parameters: lspRequestParams,
    execute: async (args, toolContext) => {
      if (!toolContext.languageService) return lspUnavailable();

      const validation = validateArgs(args);
      if (!validation.ok) return validation.result;

      const authorized = await authorizeRead(args.path, toolContext);
      if (!authorized.ok) return authorized.result;

      const response = await toolContext.languageService.request(
        {
          method: args.method,
          ...(args.languageId !== undefined
            ? { languageId: args.languageId }
            : {}),
          ...(authorized.path !== undefined ? { path: authorized.path } : {}),
          ...(authorized.absolutePath !== undefined
            ? { absolutePath: authorized.absolutePath }
            : {}),
          ...(args.line !== undefined && args.character !== undefined
            ? { position: { line: args.line, character: args.character } }
            : {}),
          ...(args.query !== undefined ? { query: args.query } : {}),
        },
        toolContext.abort,
      );

      return okResult(formatResponse(args.method, response), {
        data: { method: args.method, ...response },
      });
    },
  });
}

function validateArgs(args: {
  readonly method: LspMethod;
  readonly path?: string;
  readonly line?: number;
  readonly character?: number;
}):
  | { readonly ok: true }
  | { readonly ok: false; readonly result: ToolResult<LspRequestData> } {
  if (args.method.startsWith("textDocument/") && !args.path) {
    return validationError("`path` is required for textDocument methods.");
  }
  if (
    POSITION_METHODS.has(args.method) &&
    (args.line === undefined || args.character === undefined)
  ) {
    return validationError(
      "`line` and `character` are required for this LSP method.",
    );
  }
  return { ok: true };
}

function validationError(message: string): {
  readonly ok: false;
  readonly result: ToolResult<LspRequestData>;
} {
  return {
    ok: false,
    result: errorResult(
      toolError("unknown", message, {
        recoverable: true,
        suggestedNextAction: "Re-call lsp_request with the missing fields.",
      }),
    ),
  };
}

function lspUnavailable(): ToolResult<LspRequestData> {
  return errorResult(
    toolError(
      "language_unavailable",
      "No LSP service is available in this runtime.",
    ),
  );
}

async function authorizeRead(
  path: string | undefined,
  toolContext: ToolContext,
): Promise<
  | {
      readonly ok: true;
      readonly path?: string;
      readonly absolutePath?: string;
    }
  | { readonly ok: false; readonly result: ToolResult<LspRequestData> }
> {
  if (!path) return { ok: true };
  try {
    return {
      ok: true,
      path,
      absolutePath: await toolContext.guard.authorize(
        { type: "fs.read", resource: path },
        {
          agentName: toolContext.agentName,
          toolName: "lsp_request",
          signal: toolContext.abort,
        },
      ),
    };
  } catch (caught) {
    if (caught instanceof SandboxViolationError) {
      return {
        ok: false,
        result: errorResult(sandboxErrorToToolError(caught)),
      };
    }
    throw caught;
  }
}

function formatResponse(method: LspMethod, response: LspResponse): string {
  if (response.diagnostics) return formatDiagnostics(response.diagnostics);
  if (response.hover !== undefined) {
    return response.hover
      ? formatHover(response.hover)
      : `No hover information for ${method}.`;
  }
  if (response.locations) {
    return formatLocations(response.locations, `No locations for ${method}.`);
  }
  if (response.symbols) return formatSymbols(response.symbols);
  return `No result for ${method}.`;
}

function formatRange(range: LanguageRange): string {
  return `${range.startLine}:${range.startCharacter}-${range.endLine}:${range.endCharacter}`;
}

function formatDiagnostics(diagnostics: readonly LanguageDiagnostic[]): string {
  return diagnostics.length === 0
    ? "No diagnostics."
    : diagnostics
        .map((diagnostic) => {
          const code =
            diagnostic.code === undefined ? "" : ` ${diagnostic.code}`;
          return `${diagnostic.severity.toUpperCase()}${code} ${diagnostic.path}:${formatRange(diagnostic.range)} - ${diagnostic.message}`;
        })
        .join("\n");
}

function formatHover(hover: NonNullable<LspResponse["hover"]>): string {
  return hover.range
    ? `${hover.contents}\nRange: ${formatRange(hover.range)}`
    : hover.contents;
}

function formatLocations(
  locations: readonly LanguageLocation[],
  emptyMessage: string,
): string {
  return locations.length === 0
    ? emptyMessage
    : locations
        .map((location) => `${location.path}:${formatRange(location.range)}`)
        .join("\n");
}

function formatSymbols(symbols: readonly LanguageSymbol[]): string {
  return symbols.length === 0
    ? "No symbols found."
    : symbols.map(formatSymbol).join("\n");
}

function formatSymbol(symbol: LanguageSymbol): string {
  const container = symbol.containerName ? ` in ${symbol.containerName}` : "";
  return `${symbol.name} (${symbol.kind}${container}) at ${symbol.path}:${formatRange(symbol.range)}`;
}
