/**
 * Reject a caller promptly on cancellation while shared operations finish independently.
 * @param {Promise<Result>} operation - Shared startup or execution work.
 * @param {AbortSignal} signal - Cancellation belonging to this caller.
 * @returns {Promise<Result>} Result or a prompt cancellation rejection.
 * @internal
 */
export function waitForLspOperation<Result>(
  operation: Promise<Result>,
  signal: AbortSignal,
): Promise<Result> {
  return new Promise((resolve, reject) => {
    const abort = (): void =>
      reject(new DOMException("LSP request aborted", "AbortError"));
    signal.addEventListener("abort", abort, { once: true });
    operation
      .then(resolve, reject)
      .finally(() => signal.removeEventListener("abort", abort));
    if (signal.aborted) {
      abort();
    }
  });
}
