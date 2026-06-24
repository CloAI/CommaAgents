const MAX_LOG_STRING_LENGTH = 240;
const MAX_LOG_ARRAY_ENTRIES = 10;
const MAX_LOG_PAYLOAD_LENGTH = 2_000;
const REDACTED_VALUE = "[redacted]";

const SENSITIVE_FIELD_PATTERN =
  /(?:api.?key|authorization|credential|customdata|oauth.?token|password|secret|token)/i;

/** Format daemon protocol data for logs without exposing secrets or unbounded content. */
export function formatDaemonLogPayload(payload: unknown): string {
  let formatted: string;
  try {
    formatted =
      JSON.stringify(sanitizeLogValue(payload, new WeakSet())) ?? "undefined";
  } catch (error) {
    return `[unserializable payload: ${error instanceof Error ? error.message : String(error)}]`;
  }

  if (formatted.length <= MAX_LOG_PAYLOAD_LENGTH) return formatted;
  return `${formatted.slice(0, MAX_LOG_PAYLOAD_LENGTH)}… (${formatted.length} chars)`;
}

/** Produce a log-safe copy with bounded collections, truncated strings, and secrets removed. */
function sanitizeLogValue(
  value: unknown,
  visitedObjects: WeakSet<object>,
): unknown {
  if (typeof value === "string") {
    if (value.length <= MAX_LOG_STRING_LENGTH) return value;
    return `${value.slice(0, MAX_LOG_STRING_LENGTH)}… (${value.length} chars)`;
  }

  if (
    value === null ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return value;
  }

  if (typeof value !== "object") return String(value);
  if (visitedObjects.has(value)) return "[circular]";
  visitedObjects.add(value);

  if (Array.isArray(value)) {
    const entries = value
      .slice(0, MAX_LOG_ARRAY_ENTRIES)
      .map((entry) => sanitizeLogValue(entry, visitedObjects));
    if (value.length > MAX_LOG_ARRAY_ENTRIES) {
      entries.push(`[${value.length - MAX_LOG_ARRAY_ENTRIES} more entries]`);
    }
    return entries;
  }

  const sanitizedEntries = Object.entries(value).map(([key, entryValue]) => [
    key,
    SENSITIVE_FIELD_PATTERN.test(key)
      ? REDACTED_VALUE
      : sanitizeLogValue(entryValue, visitedObjects),
  ]);
  return Object.fromEntries(sanitizedEntries);
}
