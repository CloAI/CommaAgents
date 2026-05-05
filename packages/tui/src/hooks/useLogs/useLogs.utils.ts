let logIdCounter = 0;

/** Generate a unique sequential log entry ID. */
export function nextLogId(): string {
  logIdCounter += 1;
  return `log-${logIdCounter}`;
}

/** Stringify an array of console arguments into a single space-separated message. */
export function formatArgs(args: readonly unknown[]): string {
  return args
    .map((argument) => {
      if (typeof argument === "string") return argument;
      try {
        return JSON.stringify(argument, null, 2);
      } catch {
        return String(argument);
      }
    })
    .join(" ");
}
