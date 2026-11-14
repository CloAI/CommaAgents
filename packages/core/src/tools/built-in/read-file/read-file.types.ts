/** Resource limits applied by read_file. */
export interface ReadFileToolConfig {
  /** Maximum raw file size accepted. @default 4194304 */
  readonly maxFileBytes?: number;
  /** Maximum UTF-8 bytes in the formatted text output. @default 262144 */
  readonly maxOutputBytes?: number;
}

/** Text and metadata returned by read_file. */
export interface ReadFileData {
  /** Text from the returned whole lines, normalized to LF without a BOM. */
  readonly content: string;
  /** 1-indexed requested start line; retained for reads past EOF. */
  readonly startLine: number;
  /** Last returned line, or the requested start for a read past EOF. */
  readonly endLine: number;
  /** Total line count after LF normalization. */
  readonly lineCount: number;
  /** Size of the full raw file in bytes. */
  readonly sizeBytes: number;
  /** SHA-256 of the full raw file, including its BOM and original newlines. */
  readonly sha256: string;
  /** Whether the output limit omitted lines from the requested range. */
  readonly truncated: boolean;
}
