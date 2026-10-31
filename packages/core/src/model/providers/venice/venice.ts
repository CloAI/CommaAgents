import { randomBytes, randomUUID } from "node:crypto";
import { createOpenAI } from "@ai-sdk/openai";
import { z } from "zod";
import type { LanguageModel } from "ai";
import { verifyHardwareEvidence } from "../../privacy/verification/verification";
import type { PrivacyEvent, PrivacyReport } from "../../privacy/privacy.types";
import {
  assertPrivacyActive,
  fetchPrivacyJSON,
  privacyError,
  readPrivacyBody,
  sanitizePrivacyError,
  observePrivacy,
} from "../../privacy/privacy.utils";
import { encryptVeniceMessage, generateVeniceKeyPair } from "./venice.crypto";
import { parseVeniceStream } from "./venice.stream";
import type { VeniceProtectedOptions } from "./venice.types";

import {
  evidenceBytes,
  prepareRequest,
  authenticateReceipt,
  reportMetadata,
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
          const checks: PrivacyReport["checks"] = {
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
          const emit = (
            phase: PrivacyEvent["phase"],
            finalReport?: PrivacyReport,
          ) => {
            observePrivacy(() => {
              return options.onEvent?.({
                requestId,
                providerId: "venice",
                modelId: options.modelId,
                phase,
                ...(finalReport ? { report: finalReport } : {}),
              });
            });
          };
          try {
            assertPrivacyActive(signal);
            emit("preflight");
            if (
              String(input) !== `${VENICE_API}/chat/completions` ||
              typeof init?.body !== "string"
            )
              throw privacyError("PRIVACY_CONFIGURATION_ERROR");
            if (Buffer.byteLength(init.body) > options.limits.maxPlaintextBytes)
              throw privacyError("PRIVACY_LIMIT_EXCEEDED");
            let raw: unknown;
            try {
              raw = JSON.parse(init.body) as unknown;
            } catch {
              throw privacyError("PRIVACY_CONFIGURATION_ERROR");
            }
            const request = prepareRequest(raw, options);
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
              {},
              options.limits.maxEvidenceBytes,
              verificationSignal,
            );
            const parsed = attestationSchema.safeParse(payload);
            if (
              !parsed.success ||
              parsed.data.model !== options.modelId ||
              parsed.data.nonce !== challenge.toString("hex")
            )
              throw privacyError("PRIVACY_ATTESTATION_FAILED");
            const attestation = parsed.data;
            const keyText =
              attestation.signing_key ?? attestation.signing_public_key;
            if (!keyText) throw privacyError("PRIVACY_BINDING_UNAVAILABLE");
            const signingKey = evidenceBytes(keyText);
            await verifyHardwareEvidence(
              {
                quote: evidenceBytes(attestation.intel_quote),
                signingPublicKey: signingKey,
                nonce: challenge,
                gpuEvidence: attestation.nvidia_payload,
              },
              {
                signal,
                fetch: globalThis.fetch,
                pccsURL: options.pccsURL,
                nrasURL: options.nrasURL,
                maxEvidenceBytes: options.limits.maxEvidenceBytes,
                verificationTimeoutMs: options.limits.verificationTimeoutMs,
              },
            ).catch((error: unknown) => {
              throw sanitizePrivacyError(error, signal);
            });
            // Success is impossible while independently bound CPU/GPU evidence is unavailable.
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
              request.messages = request.messages.map((message) => ({
                ...message,
                content: encryptVeniceMessage(
                  String(message.content),
                  signingKey,
                ),
              }));
              request.venice_parameters = {
                enable_e2ee: true,
                include_venice_system_prompt: false,
                enable_web_search: "off",
                enable_web_scraping: false,
              };
            }
            const requestBody = JSON.stringify({ ...request, stream: true });
            if (Buffer.byteLength(requestBody) > options.limits.maxWireBytes)
              throw privacyError("PRIVACY_LIMIT_EXCEEDED");
            emit("inference");
            const response = await fetch(`${VENICE_API}/chat/completions`, {
              method: "POST",
              body: requestBody,
              headers,
              signal,
              redirect: "error",
            });
            if (!response.ok) {
              await response.body?.cancel();
              throw privacyError("PRIVACY_PROVIDER_ERROR");
            }
            const wire = await readPrivacyBody(
              response,
              options.limits.maxWireBytes,
              signal,
            );
            const decoded = parseVeniceStream(wire, {
              privateKey,
              maxPlaintextBytes: options.limits.maxPlaintextBytes,
            });
            emit("authentication");
            const signatureURL = new URL(`${VENICE_API}/tee/signature`);
            signatureURL.searchParams.set("model", options.modelId);
            signatureURL.searchParams.set("request_id", decoded.completionId);
            const receipt = await fetchPrivacyJSON(
              signatureURL.toString(),
              {},
              options.limits.maxEvidenceBytes,
              AbortSignal.any([
                signal,
                AbortSignal.timeout(options.limits.verificationTimeoutMs),
              ]),
            );
            authenticateReceipt(
              receipt,
              requestBody,
              wire,
              decoded.completionId,
              attestation,
              signingKey,
            );
            assertPrivacyActive(signal);
            report = {
              requestId,
              providerId: "venice",
              modelId: options.modelId,
              requirements: options.requirements,
              status: "verified",
              startedAt,
              checkedAt: new Date().toISOString(),
              checks: {
                ...checks,
                cpu: "passed",
                gpu: "passed",
                freshness: "passed",
                keyBinding: "passed",
                responseBinding: "passed",
                encryption: options.requirements.e2ee
                  ? "passed"
                  : "notApplicable",
              },
            };
            emit("verified", report);
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
        if (part.done) break;
        if (part.value.type === "error")
          throw privacyError("PRIVACY_INVALID_RESPONSE");
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
          for (const part of parts) controller.enqueue(part);
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
