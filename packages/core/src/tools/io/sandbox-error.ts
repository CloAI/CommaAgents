// Translate `SandboxViolationError.reason` into a structured `ToolError`.
//
// Every file-system tool catches `SandboxViolationError` at its entry point
// and converts it through this helper, so the LLM receives a stable
// `ToolError.kind` (`outside_workspace` or `permission_denied`) instead of
// a thrown exception bubbling out as `unknown`.

import type { SandboxViolationError } from "../../errors";
import { toolError } from "../result";
import type { ToolError } from "../tool.types";

/**
 * Map a `SandboxViolationError` to the appropriate `ToolError`.
 *
 * Mapping:
 * - `jail`, `absolute-path`       → `outside_workspace` (non-recoverable;
 *   the path is structurally invalid, not just policy-blocked).
 * - `read-denied`, `write-denied`,
 *   `forbidden-glob`, `ask-no-handler`,
 *   `ask-aborted`                 → `permission_denied`.
 */
export function sandboxErrorToToolError(
  error: SandboxViolationError,
): ToolError {
  switch (error.reason) {
    case "jail":
    case "absolute-path":
      return toolError("outside_workspace", error.message, {
        path: error.path,
        recoverable: false,
      });
    case "read-denied":
    case "write-denied":
    case "forbidden-glob":
    case "ask-no-handler":
    case "ask-aborted":
      return toolError("permission_denied", error.message, {
        path: error.path,
        recoverable: false,
      });
  }
}
