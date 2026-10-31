import type { PrivacyError, PrivacyErrorCode } from "./privacy.types";

const ERROR_MESSAGES: Record<PrivacyErrorCode, string> = {
  PRIVACY_CONFIGURATION_ERROR: "Invalid protection configuration.",
  PRIVACY_UNSUPPORTED_PROVIDER:
    "This provider has no protected transport implementation.",
  PRIVACY_UNSUPPORTED_MODEL:
    "This model cannot establish the required protection.",
  PRIVACY_UNSUPPORTED_FEATURE:
    "This request contains a feature without a verified protected protocol.",
  PRIVACY_CREDENTIAL_REQUIRED:
    "Protected inference requires an API credential.",
  PRIVACY_ATTESTATION_FAILED: "Independent hardware verification failed.",
  PRIVACY_BINDING_UNAVAILABLE:
    "Required cryptographic evidence binding is unavailable.",
  PRIVACY_RESPONSE_AUTHENTICATION_FAILED: "Completion authentication failed.",
  PRIVACY_INVALID_RESPONSE:
    "The protected endpoint returned an invalid response.",
  PRIVACY_LIMIT_EXCEEDED: "A protected request exceeded its resource limit.",
  PRIVACY_TIMEOUT: "The protected request timed out.",
  PRIVACY_CANCELLED: "The protected request was cancelled.",
  PRIVACY_CALLBACK_FAILED: "A protection observer failed.",
  PRIVACY_PROVIDER_ERROR: "The protected endpoint request failed.",
};

/** Create a sanitized non-retryable error without attaching sensitive causes.
 * @param {PrivacyErrorCode} code - Stable safe failure code.
 * @returns {PrivacyError} Error containing no provider payload or underlying cause.
 */
export function privacyError(code: PrivacyErrorCode): PrivacyError {
  return Object.assign(new Error(ERROR_MESSAGES[code]), {
    name: "PrivacyError",
    code,
  });
}

/** Run a synchronous observer without leaking its exception or accepting detached work.
 * @param {() => unknown} observe - Content-free synchronous callback.
 * @returns {void} Throws a safe callback failure for exceptions or asynchronous observers.
 */
export function observePrivacy(observe: () => unknown): void {
  try {
    const result = observe();
    if (
      result &&
      (typeof result === "object" || typeof result === "function") &&
      "then" in result &&
      typeof result.then === "function"
    ) {
      void Promise.resolve(result).catch(() => {});
      throw privacyError("PRIVACY_CALLBACK_FAILED");
    }
  } catch {
    throw privacyError("PRIVACY_CALLBACK_FAILED");
  }
}

/** Preserve only recognized protection errors; discard raw transport diagnostics.
 * @param {unknown} error - Untrusted underlying exception.
 * @param {AbortSignal} [signal] - Owning request cancellation.
 * @returns {PrivacyError} Sanitized failure.
 */
export function sanitizePrivacyError(
  error: unknown,
  signal?: AbortSignal,
): PrivacyError {
  if (signal?.aborted)
    return privacyError(
      signal.reason instanceof DOMException &&
        signal.reason.name === "TimeoutError"
        ? "PRIVACY_TIMEOUT"
        : "PRIVACY_CANCELLED",
    );
  if (
    error instanceof Error &&
    "code" in error &&
    typeof error.code === "string" &&
    Object.hasOwn(ERROR_MESSAGES, error.code)
  )
    return privacyError(error.code as PrivacyErrorCode);
  return privacyError("PRIVACY_PROVIDER_ERROR");
}

/** Check cancellation without propagating caller-supplied abort reasons.
 * @param {AbortSignal} signal - Owning request cancellation.
 * @returns {void} Throws a safe failure if cancelled.
 */
export function assertPrivacyActive(signal: AbortSignal): void {
  if (signal.aborted) throw sanitizePrivacyError(undefined, signal);
}

/** Read a bounded body; cancellation also interrupts a pending reader.
 * @param {Response} response - Upstream body owned by this operation.
 * @param {number} maxBytes - Maximum buffered body bytes.
 * @param {AbortSignal} signal - Owning request cancellation.
 * @returns {Promise<Uint8Array>} Complete bounded body.
 */
export async function readPrivacyBody(
  response: Response,
  maxBytes: number,
  signal: AbortSignal,
): Promise<Uint8Array> {
  assertPrivacyActive(signal);
  if (!response.body) throw privacyError("PRIVACY_INVALID_RESPONSE");
  const declaredLength = response.headers.get("content-length");
  if (declaredLength && Number(declaredLength) > maxBytes) {
    await response.body.cancel();
    throw privacyError("PRIVACY_LIMIT_EXCEEDED");
  }
  const reader = response.body.getReader();
  const cancel = () => {
    void reader.cancel().catch(() => {});
  };
  signal.addEventListener("abort", cancel, { once: true });
  const chunks: Uint8Array[] = [];
  let byteLength = 0;
  try {
    while (true) {
      assertPrivacyActive(signal);
      const part = await reader.read();
      assertPrivacyActive(signal);
      if (part.done) break;
      byteLength += part.value.byteLength;
      if (byteLength > maxBytes) throw privacyError("PRIVACY_LIMIT_EXCEEDED");
      chunks.push(part.value);
    }
    const result = new Uint8Array(byteLength);
    let offset = 0;
    for (const chunk of chunks) {
      result.set(chunk, offset);
      offset += chunk.length;
    }
    return result;
  } finally {
    signal.removeEventListener("abort", cancel);
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}

/** Fetch bounded JSON from a trusted endpoint, rejecting redirects and error bodies.
 * @param {string} url - Trusted endpoint.
 * @param {RequestInit} options - Request method and body.
 * @param {number} maxBytes - Maximum response body bytes.
 * @param {AbortSignal} signal - Request cancellation and deadline.
 * @returns {Promise<unknown>} Untrusted parsed JSON for schema validation.
 */
export async function fetchPrivacyJSON(
  url: string,
  options: RequestInit,
  maxBytes: number,
  signal: AbortSignal,
): Promise<unknown> {
  let response: Response;
  try {
    response = await fetch(url, { ...options, signal, redirect: "error" });
  } catch (error) {
    throw sanitizePrivacyError(error, signal);
  }
  if (!response.ok) {
    await response.body?.cancel();
    throw privacyError("PRIVACY_PROVIDER_ERROR");
  }
  const bytes = await readPrivacyBody(response, maxBytes, signal);
  try {
    return JSON.parse(
      new TextDecoder("utf-8", { fatal: true }).decode(bytes),
    ) as unknown;
  } catch {
    throw privacyError("PRIVACY_INVALID_RESPONSE");
  }
}
