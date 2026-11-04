import {
  assertPrivacyActive,
  sanitizePrivacyError,
} from "../../privacy/privacy.utils";

/** Bound SDK work that cannot always be cancelled; expired work cannot send further inference.
 * @param {() => Promise<Result>} verify - Work owned by the SDK.
 * @param {AbortSignal} signal - Owning deadline and caller cancellation.
 * @returns {Promise<Result>} SDK result before the owning request expires.
 */
export async function awaitTinfoilOperation<Result>(
  verify: () => Promise<Result>,
  signal: AbortSignal,
): Promise<Result> {
  assertPrivacyActive(signal);
  let onAbort: () => void = () => {};
  try {
    return await Promise.race([
      verify(),
      new Promise<never>((_resolve, reject) => {
        onAbort = () => reject(sanitizePrivacyError(undefined, signal));
        signal.addEventListener("abort", onAbort, { once: true });
        if (signal.aborted) {
          onAbort();
        }
      }),
    ]);
  } finally {
    signal.removeEventListener("abort", onAbort);
  }
}
