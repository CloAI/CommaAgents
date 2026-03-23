// Strategy exporter types — configuration contract.

export interface ExportStrategyOptions {
  /** Output format. @default "json" */
  readonly format?: "json" | "yaml";
  /** Indentation for JSON output. @default 2 */
  readonly indent?: number;
}
