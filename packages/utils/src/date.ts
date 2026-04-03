// Date utilities — timestamp helpers.

/**
 * Return the current time as an ISO 8601 string.
 *
 * @example
 * ```ts
 * isoNow(); // "2026-03-27T12:34:56.789Z"
 * ```
 */
export function isoNow(): string {
  return new Date().toISOString();
}
