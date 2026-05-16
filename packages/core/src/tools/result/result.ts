import type { ToolError, ToolErrorKind, ToolResult } from "../tool.types";

/**
 * Build a successful `ToolResult`.
 *
 * Use this from every tool's `execute` to guarantee the `ok` invariant
 * (`ok: true` ⇒ `error` undefined) without having to repeat the shape.
 *
 * @param output - Text returned to the LLM.
 * @param options - Optional structured `data` and `metadata` payloads.
 * @example
 * ```ts
 * return okResult("Wrote 12 bytes", { data: { sha256, sizeBytes: 12 } });
 * ```
 */
export function okResult<DataShape = unknown>(
  output: string,
  options?: {
    readonly data?: DataShape;
    readonly metadata?: Readonly<Record<string, unknown>>;
  },
): ToolResult<DataShape> {
  return {
    ok: true,
    output,
    ...(options?.data !== undefined ? { data: options.data } : {}),
    ...(options?.metadata !== undefined ? { metadata: options.metadata } : {}),
  };
}

/**
 * Build a failure `ToolResult` from a structured `ToolError`.
 *
 * `output` defaults to `error.message` so the LLM still receives a
 * human-readable string when the AI SDK only forwards `output`.
 *
 * @param errorInput - Either a fully-built `ToolError` or the fields needed to construct one.
 * @param options - Optional `output` override and `data` payload.
 * @example
 * ```ts
 * return errorResult({
 *   kind: "stale_file",
 *   message: "File changed since last read",
 *   path,
 *   recoverable: true,
 *   suggestedNextAction: STALE_FILE_RECOVERY_HINT,
 * });
 * ```
 */
export function errorResult<DataShape = unknown>(
  errorInput: ToolError,
  options?: {
    readonly output?: string;
    readonly data?: DataShape;
    readonly metadata?: Readonly<Record<string, unknown>>;
  },
): ToolResult<DataShape> {
  return {
    ok: false,
    output: options?.output ?? errorInput.message,
    error: errorInput,
    ...(options?.data !== undefined ? { data: options.data } : {}),
    ...(options?.metadata !== undefined ? { metadata: options.metadata } : {}),
  };
}

/**
 * Convenience: build a `ToolError` without manually spelling the literal kind twice.
 * Equivalent to writing the object literal directly; provided for ergonomics.
 */
export function toolError(
  kind: ToolErrorKind,
  message: string,
  fields?: Omit<ToolError, "kind" | "message">,
): ToolError {
  return {
    kind,
    message,
    recoverable: fields?.recoverable ?? false,
    ...(fields?.path !== undefined ? { path: fields.path } : {}),
    ...(fields?.details !== undefined ? { details: fields.details } : {}),
    ...(fields?.suggestedNextAction !== undefined
      ? { suggestedNextAction: fields.suggestedNextAction }
      : {}),
  };
}
