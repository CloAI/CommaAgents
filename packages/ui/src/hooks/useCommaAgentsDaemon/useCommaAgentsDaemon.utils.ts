import { ArgumentsSchema } from "@comma-agents/daemon/protocol";
import type { PreparedArguments } from "./useCommaAgentsDaemon.types";

/**
 * Order plain-object keys without changing arrays or caller-owned values.
 * @param {unknown} value - Argument value to order.
 * @returns {unknown} A copy with stable object key ordering.
 */
function sortKeys(value: unknown): unknown {
  if (value === null || typeof value !== "object") {
    return value;
  }
  if (Object.getOwnPropertySymbols(value).length) {
    throw new Error("Symbol keys are not supported in arguments.");
  }
  if (Array.isArray(value)) {
    return Array.from(value, sortKeys);
  }
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) {
    throw new Error("Arguments must contain plain JSON objects.");
  }
  const record = value as Record<string, unknown>;
  return Object.fromEntries(
    Object.keys(record)
      .sort()
      .filter((key) => record[key] !== undefined)
      .map((key) => [key, sortKeys(record[key])]),
  );
}

/**
 * Validate with the daemon's argument schema and serialize in stable key order.
 * @param {unknown} value - Arguments supplied to an operation.
 * @returns {PreparedArguments} Canonical JSON or a local validation failure.
 */
export function prepareArguments(value: unknown): PreparedArguments {
  try {
    // Native serialization detects cycles before recursively ordering keys.
    JSON.stringify(value);
    const argumentsValue = sortKeys(value);
    ArgumentsSchema.parse(argumentsValue);
    return { key: JSON.stringify(argumentsValue) };
  } catch {
    return {
      error: {
        code: "INVALID_ARGUMENTS",
        message:
          "Arguments must be a JSON object without unsupported values or cycles.",
      },
    };
  }
}
