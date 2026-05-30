export type LspMethod =
  | "textDocument/diagnostic"
  | "textDocument/hover"
  | "textDocument/definition"
  | "textDocument/typeDefinition"
  | "textDocument/implementation"
  | "textDocument/references"
  | "textDocument/documentSymbol"
  | "workspace/symbol";

export interface LanguagePosition {
  readonly path: string;
  /** 1-indexed line number. */
  readonly line: number;
  /** 1-indexed character number. */
  readonly character: number;
  readonly absolutePath?: string;
}

export interface LspRequest {
  readonly method: LspMethod;
  readonly languageId?: string;
  readonly path?: string;
  readonly absolutePath?: string;
  readonly position?: {
    readonly line: number;
    readonly character: number;
  };
  readonly query?: string;
}

export interface LanguageRange {
  readonly startLine: number;
  readonly startCharacter: number;
  readonly endLine: number;
  readonly endCharacter: number;
}

export interface LanguageLocation {
  readonly path: string;
  readonly range: LanguageRange;
}

export type LanguageDiagnosticSeverity =
  | "error"
  | "warning"
  | "information"
  | "hint";

export interface LanguageDiagnostic {
  readonly path: string;
  readonly range: LanguageRange;
  readonly severity: LanguageDiagnosticSeverity;
  readonly message: string;
  readonly code?: string | number;
  readonly source?: string;
}

export interface LanguageHoverResult {
  readonly contents: string;
  readonly range?: LanguageRange;
}

export interface LanguageSymbol {
  readonly name: string;
  readonly kind: string;
  readonly path: string;
  readonly range: LanguageRange;
  readonly containerName?: string;
}

export interface LspResponse {
  readonly diagnostics?: readonly LanguageDiagnostic[];
  readonly hover?: LanguageHoverResult | null;
  readonly locations?: readonly LanguageLocation[];
  readonly symbols?: readonly LanguageSymbol[];
}

export interface LanguageService {
  readonly languageIds: readonly string[];
  request(request: LspRequest, signal?: AbortSignal): Promise<LspResponse>;
}
