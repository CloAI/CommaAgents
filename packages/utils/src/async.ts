// Async utilities — timing and concurrency helpers.

/**
 * Return a promise that resolves after `ms` milliseconds.
 *
 * @example
 * ```ts
 * await sleep(100); // wait 100ms
 * ```
 */
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
