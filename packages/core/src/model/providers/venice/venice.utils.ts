import { createHash } from "node:crypto";
import { z } from "zod";
import type { PrivacyReport } from "../../privacy/privacy.types";
import { privacyError } from "../../privacy/privacy.utils";
import { verifyVeniceSignature } from "./venice.crypto";
import type { VeniceAttestation, VeniceProtectedOptions } from "./venice.types";

const messageSchema = z
  .object({ role: z.string(), content: z.unknown().optional() })
  .passthrough();
const requestSchema = z
  .object({
    model: z.string(),
    messages: z.array(messageSchema),
    stream: z.boolean().optional(),
  })
  .passthrough();
const receiptSchema = z.object({
  text: z.string(),
  signature: z.string(),
  request_id: z.string(),
});

/** Decode public evidence bytes without accepting malformed or ambiguous data.
 * @param {string} value - Encoded quote or key.
 * @returns {Uint8Array} Validated decoded bytes.
 */
export function evidenceBytes(value: string): Uint8Array {
  const hex = value.replace(/^0x/, "");
  if (hex.length > 0 && hex.length % 2 === 0 && /^[a-f\d]+$/i.test(hex))
    return Uint8Array.from(Buffer.from(hex, "hex"));
  if (
    !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(
      value,
    ) ||
    !value.length
  )
    throw privacyError("PRIVACY_ATTESTATION_FAILED");
  return Uint8Array.from(Buffer.from(value, "base64"));
}

/** Validate all request features before sending a prompt to an upstream endpoint.
 * @param {unknown} raw - Adapter-generated request.
 * @param {VeniceProtectedOptions} options - Enforced policy.
 * @returns {object} Validated request.
 */
export function prepareRequest(
  raw: unknown,
  options: VeniceProtectedOptions,
): z.output<typeof requestSchema> {
  const parsed = requestSchema.safeParse(raw);
  if (!parsed.success || parsed.data.model !== options.modelId)
    throw privacyError("PRIVACY_CONFIGURATION_ERROR");
  const request = parsed.data;
  if (options.modelId.includes(":"))
    throw privacyError("PRIVACY_UNSUPPORTED_FEATURE");
  const parameters = request.venice_parameters;
  if (
    parameters &&
    (typeof parameters !== "object" || Array.isArray(parameters))
  )
    throw privacyError("PRIVACY_CONFIGURATION_ERROR");
  const veniceParameters = (parameters ?? {}) as Record<string, unknown>;
  if (options.requirements.e2ee) {
    if (
      (Array.isArray(request.tools) && request.tools.length > 0) ||
      request.functions ||
      request.response_format ||
      request.audio ||
      request.modalities ||
      request.prediction
    )
      throw privacyError("PRIVACY_UNSUPPORTED_FEATURE");
    if (
      veniceParameters.enable_e2ee === false ||
      (veniceParameters.enable_web_search !== undefined &&
        veniceParameters.enable_web_search !== "off") ||
      veniceParameters.enable_web_scraping ||
      veniceParameters.enable_x_search ||
      veniceParameters.include_venice_system_prompt === true ||
      veniceParameters.character_slug
    )
      throw privacyError("PRIVACY_CONFIGURATION_ERROR");
    for (const message of request.messages) {
      if (
        !["system", "user"].includes(message.role) ||
        typeof message.content !== "string"
      )
        throw privacyError("PRIVACY_UNSUPPORTED_FEATURE");
    }
  } else {
    // Only text and standard tool messages have an established core contract.
    for (const message of request.messages) {
      if (
        message.content !== undefined &&
        message.content !== null &&
        typeof message.content !== "string"
      )
        throw privacyError("PRIVACY_UNSUPPORTED_FEATURE");
    }
    if (veniceParameters.enable_e2ee === true)
      throw privacyError("PRIVACY_CONFIGURATION_ERROR");
  }
  return request;
}

/** Require exact signed request/response hashes; never accept unknown signed hashes.
 * @param {unknown} receipt - Untrusted signature response.
 * @param {string} requestBody - Exact transmitted request bytes in UTF-8.
 * @param {Uint8Array} responseBody - Exact uncompressed response bytes.
 * @param {string} completionId - Observed completion identity.
 * @param {VeniceAttestation} attestation - Preflight evidence.
 * @param {Uint8Array} signingKey - Hardware-bound key.
 * @returns {void} Throws unless exact content binding and signature verify.
 */
export function authenticateReceipt(
  receipt: unknown,
  requestBody: string,
  responseBody: Uint8Array,
  completionId: string,
  attestation: VeniceAttestation,
  signingKey: Uint8Array,
): void {
  const parsed = receiptSchema.safeParse(receipt);
  if (!parsed.success || parsed.data.request_id !== completionId)
    throw privacyError("PRIVACY_RESPONSE_AUTHENTICATION_FAILED");
  const requestHash = createHash("sha256").update(requestBody).digest("hex");
  const responseHash = createHash("sha256").update(responseBody).digest("hex");
  const expected = `${requestHash}:${responseHash}`;
  const providerExpected = attestation.upstream_model
    ? `${attestation.upstream_model}:${expected}`
    : undefined;
  if (parsed.data.text !== expected && parsed.data.text !== providerExpected)
    throw privacyError("PRIVACY_BINDING_UNAVAILABLE");
  if (
    !verifyVeniceSignature(parsed.data.text, parsed.data.signature, signingKey)
  )
    throw privacyError("PRIVACY_RESPONSE_AUTHENTICATION_FAILED");
}

/** Build serializable SDK metadata without leaking internal request material.
 * @param {PrivacyReport} report - Content-free request outcome.
 * @returns {object} Serializable metadata.
 */
export function reportMetadata(report: PrivacyReport) {
  return {
    requestId: report.requestId,
    providerId: report.providerId,
    modelId: report.modelId,
    requirements: { ...report.requirements },
    status: report.status,
    startedAt: report.startedAt,
    checkedAt: report.checkedAt,
    checks: { ...report.checks },
  };
}
