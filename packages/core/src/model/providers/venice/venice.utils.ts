import { parseMeasurementJSON } from "./verification/measurements/measurements.utils";
import type { HardwareEvidence } from "./verification/verification.types";
import { createHash } from "node:crypto";
import { z } from "zod";
import type { PrivacyReport } from "../../privacy/privacy.types";
import { privacyError } from "../../privacy/privacy.utils";
import { verifyVeniceSignature } from "./venice.crypto";
import type {
  VeniceAttestation,
  VeniceProtectedOptions,
  VeniceReceiptChecks,
} from "./venice.types";

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
  request_id: z.string().min(1).optional(),
  requested_request_id: z.string().min(1).optional(),
});

/** Decode public evidence bytes without accepting malformed or ambiguous data.
 * @param {string} value - Encoded quote or key.
 * @returns {Uint8Array} Validated decoded bytes.
 */
export function evidenceBytes(value: string): Uint8Array {
  const hex = value.replace(/^0x/, "");
  if (hex.length > 0 && hex.length % 2 === 0 && /^[a-f\d]+$/i.test(hex)) {
    return Uint8Array.from(Buffer.from(hex, "hex"));
  }
  if (
    !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(
      value,
    ) ||
    !value.length
  ) {
    throw privacyError("PRIVACY_ATTESTATION_FAILED");
  }
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
  if (!parsed.success || parsed.data.model !== options.modelId) {
    throw privacyError("PRIVACY_CONFIGURATION_ERROR");
  }
  const request = parsed.data;
  if (options.modelId.includes(":")) {
    throw privacyError("PRIVACY_UNSUPPORTED_FEATURE");
  }
  const parameters = request.venice_parameters;
  if (
    parameters &&
    (typeof parameters !== "object" || Array.isArray(parameters))
  ) {
    throw privacyError("PRIVACY_CONFIGURATION_ERROR");
  }
  const veniceParameters = (parameters ?? {}) as Record<string, unknown>;
  if (options.requirements.e2ee) {
    if (
      request.functions ||
      request.response_format ||
      request.audio ||
      request.modalities ||
      request.prediction
    ) {
      throw privacyError("PRIVACY_UNSUPPORTED_FEATURE");
    }
    if (
      veniceParameters.enable_e2ee === false ||
      (veniceParameters.enable_web_search !== undefined &&
        veniceParameters.enable_web_search !== "off") ||
      veniceParameters.enable_web_scraping ||
      veniceParameters.enable_x_search ||
      veniceParameters.include_venice_system_prompt === true ||
      veniceParameters.character_slug
    ) {
      throw privacyError("PRIVACY_CONFIGURATION_ERROR");
    }
  } else {
    // Only text and standard tool messages have an established core contract.
    for (const message of request.messages) {
      if (
        message.content !== undefined &&
        message.content !== null &&
        typeof message.content !== "string"
      ) {
        throw privacyError("PRIVACY_UNSUPPORTED_FEATURE");
      }
    }
    if (veniceParameters.enable_e2ee === true) {
      throw privacyError("PRIVACY_CONFIGURATION_ERROR");
    }
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
 * @param {Function} [onChecks] - Receive independent safe receipt outcomes, including after rejection.
 * @returns {void} Throws unless exact content binding and signature verify.
 */
export function authenticateReceipt(
  receipt: unknown,
  requestBody: string,
  responseBody: Uint8Array,
  completionId: string,
  attestation: VeniceAttestation,
  signingKey: Uint8Array,
  onChecks?: (checks: VeniceReceiptChecks) => void,
): void {
  const parsed = receiptSchema.safeParse(receipt);
  if (!parsed.success) {
    onChecks?.(
      Object.freeze({
        completionId: "unavailable",
        signature: "unavailable",
        model: "unavailable",
        requestBody: "unavailable",
        responseBody: "unavailable",
      }),
    );
    throw privacyError("PRIVACY_RESPONSE_AUTHENTICATION_FAILED");
  }
  const identifiers = [
    parsed.data.request_id,
    parsed.data.requested_request_id,
  ].filter((identifier) => identifier !== undefined);
  const hashes = /^(?:(.*):)?([a-f0-9]{64}):([a-f0-9]{64})$/.exec(
    parsed.data.text,
  );
  const requestHash = createHash("sha256").update(requestBody).digest("hex");
  const responseHash = createHash("sha256").update(responseBody).digest("hex");
  const checks: VeniceReceiptChecks = Object.freeze({
    completionId:
      identifiers.length > 0 &&
      identifiers.every((identifier) => identifier === completionId)
        ? "passed"
        : "failed",
    signature: verifyVeniceSignature(
      parsed.data.text,
      parsed.data.signature,
      signingKey,
    )
      ? "passed"
      : "failed",
    model: !hashes
      ? "unavailable"
      : hashes[1] === undefined
        ? "notApplicable"
        : hashes[1] === attestation.upstream_model
          ? "passed"
          : "failed",
    requestBody: !hashes
      ? "unavailable"
      : hashes[2] === requestHash
        ? "passed"
        : "failed",
    responseBody: !hashes
      ? "unavailable"
      : hashes[3] === responseHash
        ? "passed"
        : "failed",
  });
  onChecks?.(checks);
  if (checks.completionId !== "passed" || checks.signature !== "passed") {
    throw privacyError("PRIVACY_RESPONSE_AUTHENTICATION_FAILED");
  }
  if (
    checks.requestBody !== "passed" ||
    checks.responseBody !== "passed" ||
    (checks.model !== "passed" && checks.model !== "notApplicable")
  ) {
    throw privacyError("PRIVACY_BINDING_UNAVAILABLE");
  }
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
    ...(report.receiptChecks
      ? { receiptChecks: { ...report.receiptChecks } }
      : {}),
    ...(report.workloadMeasurements
      ? { workloadMeasurements: { ...report.workloadMeasurements } }
      : {}),
    ...(report.workloadMismatch
      ? {
          workloadMismatch: {
            reason: report.workloadMismatch.reason,
            profiles: report.workloadMismatch.profiles.map((profile) => ({
              profileIndex: profile.profileIndex,
              differences: profile.differences.map((difference) => ({
                ...difference,
              })),
            })),
          },
        }
      : {}),
    ...(report.gpuAssociation ? { gpuAssociation: report.gpuAssociation } : {}),
  };
}

/** Keep provider software evidence for verification without trusting reported hashes.
 * @param {VeniceAttestation} attestation - Parsed provider attestation.
 * @returns {HardwareEvidence["workload"]} Raw manifest, event log, and runtime-manager evidence.
 */
export function veniceWorkloadEvidence(
  attestation: VeniceAttestation,
): HardwareEvidence["workload"] {
  const raw = attestation.info?.tcb_info;
  const tcb = raw === undefined ? {} : parseMeasurementJSON(raw);
  const parsed = z
    .object({
      app_compose: z.unknown().optional(),
      event_log: z.unknown().optional(),
    })
    .safeParse(tcb);
  if (!parsed.success) {
    throw privacyError("PRIVACY_MEASUREMENTS_INVALID");
  }
  return {
    appCompose: parsed.data.app_compose,
    eventLog: parsed.data.event_log ?? attestation.event_log,
    composeManager: attestation.compose_manager_attestation,
  };
}
