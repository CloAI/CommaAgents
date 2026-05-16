import type { NewlineStyle } from "../../io/newline";

export interface ReadFileToolConfig {
  /**
   * Default cap on the UTF-8 byte length of returned `content`. Applied
   * when the caller does not pass `maxBytes`. Defaults to 256 KiB.
   */
  readonly defaultMaxBytes?: number;
}

export interface ReadFileData {
  /** UTF-8 content of the (possibly sliced) text file. Absent for binary reads. */
  readonly content?: string;
  /** Base64-encoded full content. Only present for `allowBinary: true` reads. */
  readonly contentBase64?: string;
  /** Encoding of `content` / `contentBase64`. */
  readonly encoding: "utf8" | "base64";
  /** 1-indexed start line of the returned slice (1 when no slicing applied). */
  readonly startLine: number;
  /** 1-indexed end line of the returned slice (inclusive). */
  readonly endLine: number;
  /** Total line count of the underlying file (post LF-normalization). */
  readonly lineCount: number;
  /** Size of the on-disk file in bytes. */
  readonly sizeBytes: number;
  /** SHA-256 of the **full** on-disk bytes. */
  readonly sha256: string;
  /** True when the returned content was capped by `maxBytes`. */
  readonly truncated: boolean;
  /** True when the file was detected as binary. */
  readonly binary: boolean;
  /** Newline style of the underlying file. Absent for binary reads. */
  readonly newlineStyle?: NewlineStyle;
  /** True when the file begins with a UTF-8 BOM. Absent for binary reads. */
  readonly hasBom?: boolean;
}
