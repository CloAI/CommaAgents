/**
 * Collect failure messages and nested causes without serializing stacks or provider payloads.
 * @param {unknown} cause - Original failure.
 * @returns {string | undefined} Available diagnostic messages.
 * @internal
 */
export function errorMessage(cause: unknown): string | undefined {
  const messages: string[] = [];
  const visited = new Set<unknown>();
  let current = cause;
  while (current !== undefined && current !== null && !visited.has(current)) {
    visited.add(current);
    const message =
      typeof current === "string"
        ? current.trim()
        : typeof current === "object" &&
            "message" in current &&
            typeof current.message === "string"
          ? current.message.trim()
          : undefined;
    if (message && !messages.includes(message)) {
      messages.push(message);
    }
    current =
      typeof current === "object" && "cause" in current
        ? current.cause
        : undefined;
  }
  return messages.length > 0 ? messages.join("\nCaused by: ") : undefined;
}
