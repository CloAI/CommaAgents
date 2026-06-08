import type { ToolContext } from "../tool.types";
import type { AuditEntry, AuditSink } from "./audit.types";

/**
 * Build a base audit entry with common fields from tool context.
 *
 * Extracts timestamp, sessionId, and agentName from the context, then
 * merges in the operation-specific fields. The returned object is
 * missing only the `success` field, which is added by the caller.
 *
 * @param context - Tool execution context containing sessionId and agentName
 * @param toolName - Name of the tool performing the operation
 * @param operation - Type of file operation (create, update, delete, move)
 * @param path - Workspace-relative path of the affected file
 * @param additionalFields - Operation-specific fields to merge into the entry
 * @returns Base audit entry without the `success` field
 *
 * @example
 * ```ts
 * const base = buildAuditBase(context, "edit_file", "update", "src/foo.ts", {
 *   beforeSha256: "abc...",
 *   afterSha256: "def...",
 *   diff: "--- a/src/foo.ts\n+++ b/src/foo.ts\n..."
 * });
 * await sink.append({ ...base, success: true });
 * ```
 */
export function buildAuditBase(
  context: ToolContext,
  toolName: string,
  operation: AuditEntry["operation"],
  path: string,
  additionalFields: Partial<
    Omit<
      AuditEntry,
      | "timestamp"
      | "sessionId"
      | "agentName"
      | "toolName"
      | "operation"
      | "path"
      | "success"
    >
  > = {},
): Omit<AuditEntry, "success"> {
  return {
    timestamp: new Date().toISOString(),
    ...(context.sessionId !== undefined
      ? { sessionId: context.sessionId }
      : {}),
    agentName: context.agentName,
    toolName,
    operation,
    path,
    ...additionalFields,
  };
}

/**
 * Log a successful audit entry to the sink.
 *
 * No-op if sink is undefined. Swallows errors from the sink append
 * operation since audit failures should not block the main operation.
 *
 * @param sink - Audit sink to write to (may be undefined)
 * @param base - Base audit entry from `buildAuditBase`
 */
export async function logAuditSuccess(
  sink: AuditSink | undefined,
  base: Omit<AuditEntry, "success">,
): Promise<void> {
  if (!sink) return;
  try {
    await sink.append({ ...base, success: true });
  } catch {
    // Audit failures are non-fatal
  }
}

/**
 * Log a failed audit entry to the sink.
 *
 * No-op if sink is undefined. Swallows errors from the sink append
 * operation since audit failures should not block error handling.
 *
 * @param sink - Audit sink to write to (may be undefined)
 * @param base - Base audit entry from `buildAuditBase`
 * @param error - Human-readable error message
 */
export async function logAuditFailure(
  sink: AuditSink | undefined,
  base: Omit<AuditEntry, "success">,
  error: string,
): Promise<void> {
  if (!sink) return;
  try {
    await sink.append({ ...base, success: false, error });
  } catch {
    // Audit failures are non-fatal
  }
}
