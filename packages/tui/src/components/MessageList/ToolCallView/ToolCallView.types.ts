import type { ToolCallViewTheme } from "./ToolCallView.theme";

/**
 * Visual state of a tool call.
 *
 * - `running`   — call sent, no paired result yet (implicit on the
 *   wire; the result segment simply hasn't arrived).
 * - `completed` — paired tool-result with `status: "completed"`.
 * - `error`     — paired tool-result with `status: "error"` (mapped
 *   from the AI SDK `tool-error` part by `mapStreamPart`).
 */
export type ToolCallViewStatus = "running" | "completed" | "error";

/**
 * Map a wire-level tool-call/tool-result pairing to the renderer's
 * status. When `result` is absent the call is still in flight; when
 * present its `status` field decides between `completed` and `error`.
 */
export function deriveToolCallViewStatus(
  result: { readonly status: "completed" | "error" } | undefined,
): ToolCallViewStatus {
  if (result === undefined) return "running";
  return result.status;
}

export interface ToolCallViewProps {
  /** Bare name of the tool that was invoked (e.g. `"read_file"`). */
  readonly toolName: string;
  /**
   * Stringified tool-call arguments. Multi-line / long blobs are
   * collapsed and clipped to a single visual row by the renderer; pass
   * the raw value here.
   */
  readonly args: string;
  /** Current visual state. */
  readonly status: ToolCallViewStatus;
  /**
   * Stringified tool-result output. Only used for `status === "completed"`
   * to derive the trailing `→ N lines` summary. Ignored for `running`
   * and `error`.
   */
  readonly output?: string;
  /**
   * Error message, populated when the tool errored. Replaces the
   * trailing summary with `→ <error>` for `status === "error"`.
   */
  readonly error?: string;
}

export interface ToolCallViewRenderProps {
  /** Resolved theme styles. */
  readonly theme: ToolCallViewTheme;
  /** Glyph rendered at the head of the row. */
  readonly leadingGlyph: string;
  /** Bare name of the tool. */
  readonly toolName: string;
  /** Pre-truncated, single-line args preview (may be empty). */
  readonly argsPreview: string;
  /**
   * Pre-formatted result summary (e.g. `"\u2192 12 lines"` or
   * `"\u2192 ENOENT: no such file"`). Empty string when there is no
   * result yet.
   */
  readonly resultSummary: string;
  /** Visual status — drives glyph color. */
  readonly status: ToolCallViewStatus;
}
