import { z } from "zod/v4";
import type { BindingError } from "../../daemon-plugin/server";

/**
 * Preserve explicit domain codes while keeping unexpected errors readable.
 * @param {unknown} error - Command or channel failure.
 * @returns {BindingError} Serializable error details.
 * @internal
 */
export function bindingError(error: unknown): BindingError {
  const metadata =
    typeof error === "object" && error !== null && "metadata" in error
      ? z.record(z.string(), z.json()).safeParse(error.metadata)
      : undefined;
  return {
    code:
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      typeof error.code === "string"
        ? error.code
        : "INTERNAL_ERROR",
    message: error instanceof Error ? error.message : String(error),
    ...(metadata?.success === true ? { metadata: metadata.data } : {}),
  };
}
