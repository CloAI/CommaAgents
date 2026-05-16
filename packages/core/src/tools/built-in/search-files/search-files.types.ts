export interface SearchFilesToolConfig {
  readonly maxResults?: number;
  readonly maxFileBytes?: number;
  readonly maxDepth?: number;
}

export interface SearchFilesMatch {
  readonly path: string;
  readonly line?: number;
  readonly column?: number;
  readonly preview: string;
}

export interface SearchFilesData {
  readonly mode: "path" | "text" | "regex";
  readonly query: string;
  readonly root: string;
  readonly matches: readonly SearchFilesMatch[];
  readonly truncated: boolean;
  readonly filesScanned: number;
}
