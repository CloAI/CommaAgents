import { Identity } from "ehbp";
import {
  assertPrivacyActive,
  fetchPrivacyBytes,
  privacyError,
  readPrivacyBody,
  sanitizePrivacyError,
} from "../../../privacy/privacy.utils";
import { awaitTinfoilOperation } from "../tinfoil.utils";
import type { TinfoilDownstreamOptions } from "./downstream.types";

/** Read public evidence over authenticated HPKE; ordinary GETs cannot authenticate response bodies.
 * @param {string} target - Validated provider endpoint with a fixed evidence path.
 * @param {string} publicKey - Key from verified router evidence or its authenticated admission manifest.
 * @param {TinfoilDownstreamOptions} options - Ownership, limits, and diagnostics.
 * @returns {Promise<Uint8Array>} Bounded authenticated evidence bytes; plaintext never succeeds.
 */
export async function fetchTinfoilAuthenticatedEvidence(
  target: string,
  publicKey: string,
  options: TinfoilDownstreamOptions,
): Promise<Uint8Array> {
  const signal = AbortSignal.any([
    options.signal,
    AbortSignal.timeout(options.limits.verificationTimeoutMs),
  ]);
  assertPrivacyActive(signal);
  const identity = await awaitTinfoilOperation(
    () => Identity.fromPublicKeyHex(publicKey),
    signal,
  );
  // A nonempty POST establishes a fresh HPKE response context for these public read-only handlers.
  const { request, context } = await awaitTinfoilOperation(
    () =>
      identity.encryptRequestWithContext(
        new Request(target, {
          method: "POST",
          redirect: "error",
          headers: { "Content-Type": "application/json" },
          body: "{}",
        }),
      ),
    signal,
  );
  if (!context) {
    throw privacyError("PRIVACY_BINDING_UNAVAILABLE");
  }
  const { bytes, response } = await fetchPrivacyBytes(
    target,
    {
      method: "POST",
      redirect: "error",
      headers: request.headers,
      body: await request.arrayBuffer(),
    },
    {
      fetch: globalThis.fetch,
      signal,
      maxBytes: options.limits.maxEvidenceBytes,
      operation: "verification-http",
      onDiagnostic: options.onDiagnostic,
      visibleQueryParams: new Set(["nonce"]),
    },
  );
  try {
    const plaintext = await awaitTinfoilOperation(
      () =>
        identity.decryptResponseWithContext(
          new Response(bytes, {
            status: response.status,
            headers: response.headers,
          }),
          context,
        ),
      signal,
    );
    const evidence = await readPrivacyBody(
      plaintext,
      options.limits.maxEvidenceBytes,
      signal,
    );
    assertPrivacyActive(signal);
    return evidence;
  } catch (error) {
    const safe = sanitizePrivacyError(error, signal);
    if (safe.code !== "PRIVACY_PROVIDER_ERROR") {
      throw safe;
    }
    throw privacyError("PRIVACY_RESPONSE_AUTHENTICATION_FAILED");
  }
}
