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
