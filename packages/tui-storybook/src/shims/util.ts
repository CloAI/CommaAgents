/** Browser-safe subset of `node:util` used by the logs formatter. */
export function inspect(value: unknown): string {
  if (value instanceof Error) return value.stack ?? value.message;

  try {
    const serialized = JSON.stringify(value, (_key, nestedValue) =>
      typeof nestedValue === "bigint" ? `${nestedValue}n` : nestedValue,
    );
    return serialized ?? String(value);
  } catch {
    return String(value);
  }
}

export default { inspect };
