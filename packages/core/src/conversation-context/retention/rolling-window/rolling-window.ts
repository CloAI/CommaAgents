import type { ConversationRecord } from "../../conversation-context.types";
import { activeRecords } from "../retention.utils";
import type { RollingWindowOptions } from "./rolling-window.types";

/**
 * Apply a rolling active-record window without deleting exported records.
 *
 * @param records - Full retained record history.
 * @param options - Rolling-window configuration.
 * @example
 * ```ts
 * const prepared = applyRollingWindow(records, { maxRecords: 40 });
 * ```
 */
export function applyRollingWindow(
  records: readonly ConversationRecord[],
  options: RollingWindowOptions,
): readonly ConversationRecord[] {
  const maxRecords = Math.max(0, options.maxRecords);
  const active = activeRecords(records);
  const overflow = active.length - maxRecords;
  if (overflow <= 0) return records;

  const supersededIds = new Set(
    active.slice(0, overflow).map((record) => record.id),
  );
  return records.map((record) =>
    supersededIds.has(record.id) ? { ...record, status: "superseded" } : record,
  );
}
