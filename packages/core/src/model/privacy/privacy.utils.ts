import {
  PRIVACY_VISIBLE_HEADERS,
  PRIVACY_ERROR_BODY_LIMIT,
  PRIVACY_ERROR_BODY_TIMEOUT_MS,
} from "./privacy.constants";
import type {
  PrivacyError,
  PrivacyErrorCode,
  PrivacyDiagnostic,
  PrivacyProviderError,
  PrivacyRequestContext,
} from "./privacy.types";

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
  PRIVACY_MEASUREMENTS_UNAVAILABLE:
    "Required software measurement evidence is unavailable.",
  PRIVACY_MEASUREMENTS_INVALID:
    "Software measurement evidence does not match the authenticated quote.",
  PRIVACY_WORKLOAD_UNTRUSTED:
    "No approved software measurement profile matches this workload.",
  PRIVACY_GPU_EVIDENCE_UNAVAILABLE:
    "Required GPU attestation evidence is unavailable.",
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
  if (signal?.aborted) {
    return privacyError(
      signal.reason instanceof DOMException &&
        signal.reason.name === "TimeoutError"
        ? "PRIVACY_TIMEOUT"
        : "PRIVACY_CANCELLED",
    );
  }
  if (
    error instanceof Error &&
    "code" in error &&
    typeof error.code === "string" &&
    Object.hasOwn(ERROR_MESSAGES, error.code)
  ) {
    return privacyError(error.code as PrivacyErrorCode);
  }
  return privacyError("PRIVACY_PROVIDER_ERROR");
}

/** Check cancellation without propagating caller-supplied abort reasons.
 * @param {AbortSignal} signal - Owning request cancellation.
 * @returns {void} Throws a safe failure if cancelled.
 */
export function assertPrivacyActive(signal: AbortSignal): void {
  if (signal.aborted) {
    throw sanitizePrivacyError(undefined, signal);
  }
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
  if (!response.body) {
    throw privacyError("PRIVACY_INVALID_RESPONSE");
  }
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
      if (part.done) {
        break;
      }
      byteLength += part.value.byteLength;
      if (byteLength > maxBytes) {
        throw privacyError("PRIVACY_LIMIT_EXCEEDED");
      }
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
 * @param {Pick<PrivacyRequestContext, "operation" | "onDiagnostic" | "visibleHeaders" | "visibleQueryParams">} [diagnostics] - Safe operation observer and adapter-owned public metadata fields.
 * @returns {Promise<unknown>} Untrusted parsed JSON for schema validation.
 */
export async function fetchPrivacyJSON(
  url: string,
  options: RequestInit,
  maxBytes: number,
  signal: AbortSignal,
  diagnostics?: Pick<
    PrivacyRequestContext,
    "operation" | "onDiagnostic" | "visibleHeaders" | "visibleQueryParams"
  >,
): Promise<unknown> {
  const { bytes } = await fetchPrivacyBytes(url, options, {
    fetch: globalThis.fetch,
    signal,
    maxBytes,
    operation: diagnostics?.operation ?? "attestation",
    onDiagnostic: diagnostics?.onDiagnostic,
    visibleHeaders: diagnostics?.visibleHeaders,
    visibleQueryParams: diagnostics?.visibleQueryParams,
  });
  try {
    return JSON.parse(
      new TextDecoder("utf-8", { fatal: true }).decode(bytes),
    ) as unknown;
  } catch {
    throw privacyError("PRIVACY_INVALID_RESPONSE");
  }
}

/** Fetch a bounded response with content-free lifecycle diagnostics.
 * @param {string} url - Trusted service URL; query values are logged only for public protocol fields.
 * @param {RequestInit} options - Request options; header diagnostics redact credentials and unknown values.
 * @param {PrivacyRequestContext} context - HTTP implementation, limits, and observer.
 * @returns {Promise<object>} Response metadata and bounded bytes.
 */
export async function fetchPrivacyBytes(
  url: string,
  options: RequestInit,
  context: PrivacyRequestContext,
): Promise<{ readonly response: Response; readonly bytes: Uint8Array }> {
  const address = new URL(url);
  const startedAt = performance.now();
  const headers = new Headers(options.headers);
  const requestHeaders = Object.fromEntries(
    [...headers].map(([name, value]) => [
      name,
      PRIVACY_VISIBLE_HEADERS.has(name) || context.visibleHeaders?.has(name)
        ? value
        : name === "authorization" && /^Bearer\s/i.test(value)
          ? "Bearer [REDACTED]"
          : "[REDACTED]",
    ]),
  );
  const queryParams = Object.fromEntries(
    [...new Set(address.searchParams.keys())].map((name) => [
      name,
      address.searchParams
        .getAll(name)
        .map((value) =>
          context.visibleQueryParams?.has(name) ? value : "[REDACTED]",
        ),
    ]),
  );
  const details = {
    operation: context.operation,
    endpoint: `${address.origin}${address.pathname}`,
    requestHeaders,
    queryParams,
    method: options.method === "POST" ? "POST" : "GET",
    authenticated: headers.has("Authorization"),
  };
  const emit = (diagnostic: PrivacyDiagnostic) =>
    observePrivacy(() => context.onDiagnostic?.(diagnostic));
  emit({ ...details, status: "started" });
  let response: Response | undefined;
  let providerError: PrivacyProviderError | undefined;
  try {
    assertPrivacyActive(context.signal);
    response = await context.fetch(url, {
      ...options,
      headers,
      signal: context.signal,
      redirect: "error",
    });
    if (!response.ok) {
      if (context.onDiagnostic) {
        providerError = await readProviderError(response, options, context);
      } else {
        await response.body?.cancel().catch(() => {});
      }
      throw privacyError("PRIVACY_PROVIDER_ERROR");
    }
    const bytes = await readPrivacyBody(
      response,
      context.maxBytes,
      context.signal,
    );
    emit({
      ...details,
      status: "succeeded",
      httpStatus: response.status,
      durationMs: performance.now() - startedAt,
    });
    return { response, bytes };
  } catch (error) {
    const safeError = sanitizePrivacyError(error, context.signal);
    const transport =
      error instanceof Error && "cause" in error ? error.cause : error;
    const rawCode =
      typeof transport === "object" && transport !== null && "code" in transport
        ? transport.code
        : undefined;
    const transportCode =
      typeof rawCode === "string" &&
      [
        "ECONNRESET",
        "ECONNREFUSED",
        "ENOTFOUND",
        "EAI_AGAIN",
        "ETIMEDOUT",
        "EHOSTUNREACH",
        "ENETUNREACH",
        "CERT_HAS_EXPIRED",
        "UNABLE_TO_VERIFY_LEAF_SIGNATURE",
        "DEPTH_ZERO_SELF_SIGNED_CERT",
        "ERR_TLS_CERT_ALTNAME_INVALID",
        "UND_ERR_CONNECT_TIMEOUT",
        "UND_ERR_HEADERS_TIMEOUT",
        "UND_ERR_SOCKET",
      ].includes(rawCode)
        ? rawCode
        : undefined;
    emit({
      ...details,
      status: "failed",
      durationMs: performance.now() - startedAt,
      ...(response ? { httpStatus: response.status } : {}),
      ...(providerError ? { providerError } : {}),
      errorCode: safeError.code,
      failure:
        safeError.code === "PRIVACY_TIMEOUT"
          ? "timeout"
          : safeError.code === "PRIVACY_CANCELLED"
            ? "cancelled"
            : response && !response.ok
              ? "http"
              : response
                ? "response"
                : "network",
      ...(transportCode ? { transportCode } : {}),
    });
    throw safeError;
  }
}

/** Trace an independent hardware check without exposing evidence or raw exceptions.
 * @param {PrivacyDiagnostic["operation"]} operation - Check being performed.
 * @param {Pick<PrivacyRequestContext, "signal" | "onDiagnostic">} context - Request cancellation and safe observer.
 * @param {() => Promise<CheckResult>} verify - Verification action.
 * @returns {Promise<CheckResult>} Authenticated result, returned only when the check succeeds.
 */
export async function tracePrivacyCheck<CheckResult>(
  operation: PrivacyDiagnostic["operation"],
  context: Pick<PrivacyRequestContext, "signal" | "onDiagnostic">,
  verify: () => Promise<CheckResult>,
): Promise<CheckResult> {
  const startedAt = performance.now();
  observePrivacy(() =>
    context.onDiagnostic?.({ operation, status: "started" }),
  );
  try {
    const result = await verify();
    observePrivacy(() =>
      context.onDiagnostic?.({
        operation,
        status: "succeeded",
        durationMs: performance.now() - startedAt,
      }),
    );
    return result;
  } catch (error) {
    const safeError = sanitizePrivacyError(error, context.signal);
    observePrivacy(() =>
      context.onDiagnostic?.({
        operation,
        status: "failed",
        durationMs: performance.now() - startedAt,
        errorCode: safeError.code,
        failure: "verification",
      }),
    );
    throw safeError;
  }
}

/** Read only bounded structured error metadata while preserving the owning HTTP failure.
 * @param {Response} response - Failed HTTP response.
 * @param {RequestInit} options - Request options used to identify credentials for redaction.
 * @param {PrivacyRequestContext} context - Parent deadline and evidence budget.
 * @returns {Promise<PrivacyProviderError>} Safe provider error summary.
 */
async function readProviderError(
  response: Response,
  options: RequestInit,
  context: PrivacyRequestContext,
): Promise<PrivacyProviderError> {
  let value: unknown;
  try {
    const bytes = await readPrivacyBody(
      response,
      Math.min(context.maxBytes, PRIVACY_ERROR_BODY_LIMIT),
      AbortSignal.any([
        context.signal,
        AbortSignal.timeout(PRIVACY_ERROR_BODY_TIMEOUT_MS),
      ]),
    );
    value = JSON.parse(
      new TextDecoder("utf-8", { fatal: true }).decode(bytes),
    ) as unknown;
  } catch {
    return {
      message:
        "Provider error body omitted: unreadable, non-JSON, oversized, or timed out.",
      messageRedacted: true,
    };
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {
      message: "Provider error message omitted: unrecognized response format.",
      messageRedacted: true,
    };
  }
  const root = value as Record<string, unknown>;
  const error =
    root.error && typeof root.error === "object" && !Array.isArray(root.error)
      ? (root.error as Record<string, unknown>)
      : root;
  const secrets = [...new Headers(options.headers)]
    .filter(
      ([name]) =>
        !PRIVACY_VISIBLE_HEADERS.has(name) &&
        !context.visibleHeaders?.has(name),
    )
    .flatMap(([, secret]) => [secret, secret.replace(/^Bearer\s+/i, "")])
    .filter((secret) => secret.length >= 4);
  const safeIdentifier = (candidate: unknown): string | undefined => {
    if (
      typeof candidate !== "string" ||
      !/^[a-zA-Z_][a-zA-Z0-9_.[\]-]{0,127}$/.test(candidate) ||
      /(?:sk-|bearer|token=)/i.test(candidate) ||
      /^[a-f0-9]{48,}$/i.test(candidate) ||
      secrets.some((secret) => candidate.includes(secret))
    ) {
      return undefined;
    }
    return candidate;
  };
  const details = error.details ?? root.details;
  const issues = Array.isArray(error.issues)
    ? error.issues
    : Array.isArray(details)
      ? details
      : [];
  const validation = issues.slice(0, 20).flatMap((issue: unknown) => {
    if (!issue || typeof issue !== "object" || Array.isArray(issue)) {
      return [];
    }
    const entry = issue as Record<string, unknown>;
    const code = safeIdentifier(entry.code);
    const path =
      Array.isArray(entry.path) &&
      entry.path.length <= 16 &&
      entry.path.every(
        (segment) =>
          typeof segment === "string" ||
          (typeof segment === "number" &&
            Number.isSafeInteger(segment) &&
            segment >= 0),
      )
        ? entry.path.join(".")
        : undefined;
    const param = safeIdentifier(path);
    return code || param
      ? [{ ...(code ? { code } : {}), ...(param ? { param } : {}) }]
      : [];
  });
  if (
    details &&
    typeof details === "object" &&
    !Array.isArray(details) &&
    "fieldErrors" in details &&
    details.fieldErrors &&
    typeof details.fieldErrors === "object" &&
    !Array.isArray(details.fieldErrors)
  ) {
    for (const field of Object.keys(details.fieldErrors).slice(0, 20)) {
      const param = safeIdentifier(field);
      if (param) {
        validation.push({ param });
      }
    }
  }
  const code = safeIdentifier(error.code);
  const type = safeIdentifier(error.type);
  const param = safeIdentifier(error.param);
  const rawMessage =
    typeof error.message === "string"
      ? error.message
      : typeof root.error === "string"
        ? root.error
        : typeof root.detail === "string"
          ? root.detail
          : "";
  const validationMessage = rawMessage.replace(
    /^Provider failed for model '[^'\r\n]{1,200}':\s*/,
    "",
  );
  let message =
    "Provider error message omitted: unrecognized or potentially sensitive text.";
  let messageRedacted = true;
  if (!secrets.some((secret) => rawMessage.includes(secret))) {
    // Retain validation categories, never arbitrary provider prose that could echo prompts.
    const parameterMatch =
      /^(?:Unrecognized request argument supplied|Unknown parameter|Unsupported parameter|Unrecognized parameter|Invalid parameter):\s*['"]?([a-zA-Z_][a-zA-Z0-9_.[\]-]{0,127})['"]?[.!]?$/i.exec(
        validationMessage,
      );
    if (parameterMatch && safeIdentifier(parameterMatch[1])) {
      message = `Invalid or unsupported request parameter: ${parameterMatch[1]}.`;
    } else if (
      /^(?:Encrypted field is not valid hex|Encrypted field is not valid hexadecimal)/i.test(
        validationMessage,
      )
    ) {
      message = "Encrypted field is not valid hex.";
    } else if (
      /^(?:E2EE decryption failed|Failed to decrypt|Unable to decrypt|Decryption failed)/i.test(
        validationMessage,
      )
    ) {
      message = "Provider could not decrypt the encrypted request.";
    } else if (
      /^(?:Invalid (?:client |model )?public key|Client pubkey must be)/i.test(
        validationMessage,
      )
    ) {
      message = "Provider rejected the public-key format.";
    } else if (
      /^(?:Nonce must be|Invalid nonce|Nonce length)/i.test(validationMessage)
    ) {
      message = "Provider rejected the attestation nonce format or length.";
    } else if (
      /^(?:Invalid API key|Incorrect API key|Unauthorized|Authentication failed)/i.test(
        validationMessage,
      )
    ) {
      message = "Provider rejected authentication.";
    } else if (
      /^(?:Invalid request|Request validation failed|Validation error|Validation failed|Input validation failed)/i.test(
        validationMessage,
      )
    ) {
      message = "Provider rejected request validation.";
    } else if (
      /^(?:This model.*(?:does not support|not supported)|E2EE (?:is )?not supported)/i.test(
        validationMessage,
      )
    ) {
      message =
        "Provider reports that the requested feature is unsupported for this model.";
    } else if (
      /^(?:Maximum context length|Context length|Requested maximum tokens|max_tokens|max_completion_tokens)/i.test(
        validationMessage,
      )
    ) {
      message = "Provider rejected the context length or token limit.";
    }
    messageRedacted = message !== rawMessage;
  }
  return {
    ...(code ? { code } : {}),
    ...(type ? { type } : {}),
    ...(param ? { param } : {}),
    message,
    messageRedacted,
    ...(validation.length ? { validation: validation.slice(0, 20) } : {}),
  };
}
