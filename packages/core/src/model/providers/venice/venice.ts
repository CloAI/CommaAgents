import {
  VENICE_VISIBLE_HEADERS,
  VENICE_VISIBLE_QUERY_PARAMS,
} from "./venice.constants";
import { randomBytes, randomUUID } from "node:crypto";
import { createOpenAI } from "@ai-sdk/openai";
import { z } from "zod";
import type { LanguageModel } from "ai";
import { verifyHardwareEvidence } from "./verification/verification";
import type {
  PrivacyEvent,
  PrivacyReport,
  PrivacyDiagnostic,
} from "../../privacy/privacy.types";
import {
  assertPrivacyActive,
  fetchPrivacyJSON,
  fetchPrivacyBytes,
  privacyError,
  sanitizePrivacyError,
  observePrivacy,
  tracePrivacyCheck,
} from "../../privacy/privacy.utils";
import { encryptVeniceMessages, generateVeniceKeyPair } from "./venice.crypto";
import { prepareVeniceTools } from "./venice.tools";
import { parseVeniceStream } from "./venice.stream";
import type {
  VeniceProtectedOptions,
  VeniceWorkloadMeasurements,
} from "./venice.types";

import {
  evidenceBytes,
  prepareRequest,
  authenticateReceipt,
  reportMetadata,
  veniceWorkloadEvidence,
} from "./venice.utils";

const VENICE_API = "https://api.venice.ai/api/v1";
const attestationSchema = z.object({
  model: z.string(),
  nonce: z.string(),
  intel_quote: z.string(),
  signing_key: z.string().optional(),
  signing_public_key: z.string().optional(),
  nvidia_payload: z.unknown().optional(),
  upstream_model: z.string().optional(),
  verified: z.boolean().optional(),
  event_log: z.unknown().optional(),
  info: z.object({ tcb_info: z.unknown().optional() }).optional(),
  compose_manager_attestation: z.unknown().optional(),
});
/**
 * Create a Venice chat adapter whose transport enforces required protection.
 * @param {VeniceProtectedOptions} options - Trusted credential and verification requirements.
 * @returns {LanguageModel} Chat model that releases only independently authenticated output.
 * @internal
 */
export function createVeniceProtectedModel(
  options: VeniceProtectedOptions,
): LanguageModel {
  const shape = createOpenAI({
    apiKey: "transport-owned",
    baseURL: VENICE_API,
  }).chat(options.modelId);

  async function invoke<Operation extends "doGenerate" | "doStream">(
    operation: Operation,
    parameters: Parameters<typeof shape.doGenerate>[0],
  ) {
    let report: PrivacyReport | undefined;
    const model = createOpenAI({
      apiKey: "transport-owned",
      baseURL: VENICE_API,
      fetch: Object.assign(
        async (
          input: Parameters<typeof fetch>[0],
          init?: Parameters<typeof fetch>[1],
        ) => {
          const signal = AbortSignal.any([
            AbortSignal.timeout(options.limits.requestTimeoutMs),
            ...(options.signal ? [options.signal] : []),
            ...(parameters.abortSignal ? [parameters.abortSignal] : []),
          ]);
          const requestId = randomUUID();
          const startedAt = new Date().toISOString();
          let checks: PrivacyReport["checks"] = {
            cpu: "unavailable",
            gpu: "unavailable",
            freshness: "unavailable",
            keyBinding: "unavailable",
            responseBinding: "unavailable",
            encryption: options.requirements.e2ee
              ? "unavailable"
              : "notApplicable",
            workload: "unavailable",
          };
          let privateKey: Uint8Array | undefined;
          let workloadMeasurements: VeniceWorkloadMeasurements | undefined;
          let workloadMismatch: PrivacyReport["workloadMismatch"];
          let receiptChecks: PrivacyReport["receiptChecks"];
          let acceptedUnboundReceipt = false;
          let currentPhase: PrivacyEvent["phase"] = "preflight";
          const emit = (
            phase: PrivacyEvent["phase"],
            finalReport?: PrivacyReport,
            diagnostic?: PrivacyDiagnostic,
          ) => {
            currentPhase = phase;
            observePrivacy(() => {
              return options.onEvent?.({
                requestId,
                providerId: "venice",
                modelId: options.modelId,
                phase,
                ...(finalReport ? { report: finalReport } : {}),
                ...(diagnostic ? { diagnostic } : {}),
              });
            });
          };
          const onDiagnostic = (diagnostic: PrivacyDiagnostic) => {
            const status =
              diagnostic.status === "succeeded" ? "passed" : "failed";
            if (diagnostic.status !== "started") {
              if (diagnostic.operation === "cpu-verification") {
                checks = {
                  ...checks,
                  cpu: status,
                  ...(status === "passed"
                    ? { freshness: "passed", keyBinding: "passed" }
                    : {}),
                };
              } else if (diagnostic.operation === "gpu-verification") {
                checks = {
                  ...checks,
                  gpu:
                    diagnostic.errorCode === "PRIVACY_GPU_EVIDENCE_UNAVAILABLE"
                      ? "unavailable"
                      : status,
                };
              } else if (
                diagnostic.operation === "workload-verification" ||
                diagnostic.operation === "workload-measurements"
              ) {
                checks = {
                  ...checks,
                  workload:
                    diagnostic.operation === "workload-measurements" &&
                    status === "passed"
                      ? "unavailable"
                      : status,
                };
              }
            }
            emit(currentPhase, undefined, {
              ...diagnostic,
              ...(diagnostic.operation === "workload-verification" &&
              diagnostic.status === "failed" &&
              workloadMismatch
                ? { workloadMismatch }
                : {}),
              ...(diagnostic.operation === "workload-measurements" &&
              workloadMeasurements
                ? { measurements: workloadMeasurements }
                : {}),
            });
          };
          try {
            assertPrivacyActive(signal);
            emit("preflight");
            if (
              String(input) !== `${VENICE_API}/chat/completions` ||
              typeof init?.body !== "string"
            ) {
              throw privacyError("PRIVACY_CONFIGURATION_ERROR");
            }
            if (
              Buffer.byteLength(init.body) > options.limits.maxPlaintextBytes
            ) {
              throw privacyError("PRIVACY_LIMIT_EXCEEDED");
            }
            let raw: unknown;
            try {
              raw = JSON.parse(init.body) as unknown;
            } catch {
              throw privacyError("PRIVACY_CONFIGURATION_ERROR");
            }
            const request = prepareRequest(raw, options);
            const toolPolicy = options.requirements.e2ee
              ? prepareVeniceTools(request)
              : undefined;
            if (
              Buffer.byteLength(JSON.stringify(request)) >
              options.limits.maxPlaintextBytes
            ) {
              throw privacyError("PRIVACY_LIMIT_EXCEEDED");
            }
            const challenge = randomBytes(32);
            const verificationSignal = AbortSignal.any([
              signal,
              AbortSignal.timeout(options.limits.verificationTimeoutMs),
            ]);
            emit("attestation");
            const attestationURL = new URL(`${VENICE_API}/tee/attestation`);
            attestationURL.searchParams.set("model", options.modelId);
            attestationURL.searchParams.set("nonce", challenge.toString("hex"));
            const payload = await fetchPrivacyJSON(
              attestationURL.toString(),
              { headers: { Authorization: `Bearer ${options.apiKey}` } },
              options.limits.maxEvidenceBytes,
              verificationSignal,
              {
                operation: "attestation",
                onDiagnostic,
                visibleQueryParams: VENICE_VISIBLE_QUERY_PARAMS,
              },
            );
            const parsed = attestationSchema.safeParse(payload);
            if (
              !parsed.success ||
              parsed.data.verified !== true ||
              parsed.data.model !== options.modelId ||
              parsed.data.nonce !== challenge.toString("hex")
            ) {
              throw privacyError("PRIVACY_ATTESTATION_FAILED");
            }
            const attestation = parsed.data;
            const keyText =
              attestation.signing_key ?? attestation.signing_public_key;
            if (!keyText) {
              throw privacyError("PRIVACY_BINDING_UNAVAILABLE");
            }
            const keyBytes = evidenceBytes(keyText);
            const signingKey =
              keyBytes.length === 64
                ? Uint8Array.from([4, ...keyBytes])
                : keyBytes;
            await verifyHardwareEvidence(
              {
                quote: evidenceBytes(attestation.intel_quote),
                signingPublicKey: signingKey,
                nonce: challenge,
                gpuEvidence: attestation.nvidia_payload,
                workload: veniceWorkloadEvidence(attestation),
              },
              {
                signal,
                fetch: globalThis.fetch,
                pccsURL: options.pccsURL,
                nrasURL: options.nrasURL,
                maxEvidenceBytes: options.limits.maxEvidenceBytes,
                verificationTimeoutMs: options.limits.verificationTimeoutMs,
                onDiagnostic,
                trustedWorkloads:
                  options.trustedWorkloads?.[`venice/${options.modelId}`],
                onMeasurements: (measurements) => {
                  workloadMeasurements = measurements;
                },
                onWorkloadMismatch: (mismatch) => {
                  workloadMismatch = mismatch;
                },
              },
            ).catch((error: unknown) => {
              throw sanitizePrivacyError(error, signal);
            });
            // Approved measured software enforces the GPU channel; physical co-location is not asserted.
            assertPrivacyActive(signal);
            const headers: Record<string, string> = {
              Authorization: `Bearer ${options.apiKey}`,
              "Content-Type": "application/json",
            };
            if (options.requirements.e2ee) {
              const keyPair = generateVeniceKeyPair();
              privateKey = keyPair.privateKey;
              headers["X-Venice-TEE-Client-Pub-Key"] = Buffer.from(
                keyPair.publicKey,
              ).toString("hex");
              headers["X-Venice-TEE-Model-Pub-Key"] =
                Buffer.from(signingKey).toString("hex");
              headers["X-Venice-TEE-Signing-Algo"] = "ecdsa";
              request.messages = encryptVeniceMessages(
                request.messages,
                signingKey,
              );
              request.venice_parameters = {
                enable_e2ee: true,
                include_venice_system_prompt: false,
                enable_web_search: "off",
                enable_web_scraping: false,
              };
            }
            const requestBody = JSON.stringify({ ...request, stream: true });
            if (Buffer.byteLength(requestBody) > options.limits.maxWireBytes) {
              throw privacyError("PRIVACY_LIMIT_EXCEEDED");
            }
            emit("inference");
            const { bytes: wire } = await fetchPrivacyBytes(
              `${VENICE_API}/chat/completions`,
              {
                method: "POST",
                body: requestBody,
                headers,
              },
              {
                fetch: globalThis.fetch,
                signal,
                maxBytes: options.limits.maxWireBytes,
                operation: "inference",
                onDiagnostic,
                visibleHeaders: VENICE_VISIBLE_HEADERS,
                visibleQueryParams: VENICE_VISIBLE_QUERY_PARAMS,
              },
            );
            let decodingFailure: string | undefined;
            const decoded = await tracePrivacyCheck(
              "response-decoding",
              {
                signal,
                onDiagnostic: (diagnostic) =>
                  onDiagnostic({
                    ...diagnostic,
                    ...(decodingFailure
                      ? { failureReason: decodingFailure }
                      : {}),
                  }),
              },
              async () =>
                parseVeniceStream(wire, {
                  privateKey,
                  toolPolicy,
                  maxPlaintextBytes: options.limits.maxPlaintextBytes,
                  onToolDecodeFailure: (reason) => {
                    decodingFailure = reason;
                  },
                }),
            );
            checks = {
              ...checks,
              encryption: options.requirements.e2ee
                ? "passed"
                : "notApplicable",
            };
            emit("authentication");
            const signatureURL = new URL(`${VENICE_API}/tee/signature`);
            signatureURL.searchParams.set("model", options.modelId);
            signatureURL.searchParams.set("request_id", decoded.completionId);
            const receipt = await fetchPrivacyJSON(
              signatureURL.toString(),
              { headers: { Authorization: `Bearer ${options.apiKey}` } },
              options.limits.maxEvidenceBytes,
              AbortSignal.any([
                signal,
                AbortSignal.timeout(options.limits.verificationTimeoutMs),
              ]),
              {
                operation: "response-signature",
                onDiagnostic,
                visibleQueryParams: VENICE_VISIBLE_QUERY_PARAMS,
              },
            );
            try {
              authenticateReceipt(
                receipt,
                requestBody,
                wire,
                decoded.completionId,
                attestation,
                signingKey,
                (result) => {
                  receiptChecks = result;
                },
              );
            } catch (error) {
              checks = { ...checks, responseBinding: "failed" };
              const safeError = sanitizePrivacyError(error, signal);
              if (
                !options.allowUnboundReceipts ||
                safeError.code !== "PRIVACY_BINDING_UNAVAILABLE" ||
                receiptChecks?.signature !== "passed" ||
                receiptChecks.completionId !== "passed" ||
                !["passed", "notApplicable"].includes(
                  receiptChecks.model ?? "",
                ) ||
                !["passed", "failed"].includes(
                  receiptChecks.requestBody ?? "",
                ) ||
                !["passed", "failed"].includes(
                  receiptChecks.responseBody ?? "",
                ) ||
                (receiptChecks.requestBody !== "failed" &&
                  receiptChecks.responseBody !== "failed")
              ) {
                throw safeError;
              }
              // TODO: Remove this opt-in exception when Venice exposes reproducible
              // request/response bindings. A valid signature over different body hashes
              // does not authenticate the exact conversation or ordering of tool-call chunks.
              acceptedUnboundReceipt = true;
            }
            assertPrivacyActive(signal);
            report = {
              requestId,
              providerId: "venice",
              modelId: options.modelId,
              requirements: options.requirements,
              status: acceptedUnboundReceipt ? "degraded" : "verified",
              ...(acceptedUnboundReceipt
                ? { errorCode: "PRIVACY_BINDING_UNAVAILABLE" as const }
                : {}),
              receiptChecks,
              workloadMeasurements,
              gpuAssociation: "approved-workload",
              startedAt,
              checkedAt: new Date().toISOString(),
              checks: {
                ...checks,
                cpu: "passed",
                gpu: "passed",
                freshness: "passed",
                keyBinding: "passed",
                responseBinding: acceptedUnboundReceipt ? "failed" : "passed",
                encryption: options.requirements.e2ee
                  ? "passed"
                  : "notApplicable",
              },
            };
            emit(acceptedUnboundReceipt ? "degraded" : "verified", report);
            observePrivacy(() => options.onReport?.(report!));
            return new Response(
              request.stream
                ? decoded.body
                : JSON.stringify(decoded.completion),
              {
                headers: {
                  "Content-Type": request.stream
                    ? "text/event-stream"
                    : "application/json",
                },
              },
            );
          } catch (error) {
            const safeError = sanitizePrivacyError(error, signal);
            report = {
              requestId,
              providerId: "venice",
              modelId: options.modelId,
              requirements: options.requirements,
              status: "rejected",
              ...(workloadMismatch ? { workloadMismatch } : {}),
              ...(receiptChecks ? { receiptChecks } : {}),
              ...(workloadMeasurements ? { workloadMeasurements } : {}),
              ...(checks.workload === "passed"
                ? { gpuAssociation: "approved-workload" as const }
                : {}),
              startedAt,
              checkedAt: new Date().toISOString(),
              checks,
              errorCode: safeError.code,
            };
            try {
              emit("rejected", report);
              observePrivacy(() => options.onReport?.(report!));
            } catch {
              throw privacyError("PRIVACY_CALLBACK_FAILED");
            }
            throw safeError;
          } finally {
            privateKey?.fill(0);
          }
        },
        { preconnect: fetch.preconnect },
      ),
    }).chat(options.modelId);
    if (operation === "doGenerate") {
      const result = await model.doGenerate(parameters);
      return {
        ...result,
        providerMetadata: {
          ...result.providerMetadata,
          ...(report ? { commaPrivacy: reportMetadata(report) } : {}),
        },
      };
    }
    const result = await model.doStream(parameters);
    const finalReport = report;
    const reader = result.stream.getReader();
    const parts: NonNullable<
      Awaited<ReturnType<typeof reader.read>>["value"]
    >[] = [];
    try {
      while (true) {
        const part = await reader.read();
        if (part.done) {
          break;
        }
        if (part.value.type === "error") {
          throw privacyError("PRIVACY_INVALID_RESPONSE");
        }
        parts.push(
          part.value.type === "finish" && finalReport
            ? {
                ...part.value,
                providerMetadata: {
                  ...part.value.providerMetadata,
                  commaPrivacy: reportMetadata(finalReport),
                },
              }
            : part.value,
        );
      }
    } finally {
      await reader.cancel().catch(() => {});
      reader.releaseLock();
    }
    return {
      ...result,
      stream: new ReadableStream({
        start(controller) {
          for (const part of parts) {
            controller.enqueue(part);
          }
          controller.close();
        },
      }),
    };
  }
  return {
    specificationVersion: "v3",
    provider: "venice.protected",
    modelId: options.modelId,
    supportedUrls: {},
    doGenerate: (parameters) =>
      invoke("doGenerate", parameters).catch((error: unknown) => {
        throw sanitizePrivacyError(
          error,
          parameters.abortSignal ?? options.signal,
        );
      }) as ReturnType<typeof shape.doGenerate>,
    doStream: (parameters) =>
      invoke("doStream", parameters).catch((error: unknown) => {
        throw sanitizePrivacyError(
          error,
          parameters.abortSignal ?? options.signal,
        );
      }) as ReturnType<typeof shape.doStream>,
  };
}
