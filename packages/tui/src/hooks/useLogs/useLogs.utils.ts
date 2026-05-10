import { inspect } from "node:util";

let logIdCounter = 0;

/** Generate a unique sequential log entry ID. */
export function nextLogId(): string {
  logIdCounter += 1;
  return `log-${logIdCounter}`;
}

/**
 * Stringify console arguments into a single space-separated message.
 *
 * Strings are passed through verbatim. Everything else is rendered with
 * `util.inspect`, which handles `Error` instances, circular references,
 * `Symbol`, `BigInt`, and class instances cleanly — JSON.stringify would
 * either throw or strip these.
 */
export function formatArgs(args: readonly unknown[]): string {
  return args
    .map((argument) => {
      if (typeof argument === "string") return argument;
      return inspect(argument, { depth: 4, breakLength: 120, colors: false });
    })
    .join(" ");
}

/** @internal Reset the log id counter. Test-only. */
export function _resetLogIdCounterForTests(): void {
  logIdCounter = 0;
}
