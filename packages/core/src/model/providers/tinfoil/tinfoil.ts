import { tinfoilDownstream } from "./downstream/downstream";
import { randomUUID, randomBytes } from "node:crypto";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { Identity, PROTOCOL } from "ehbp";
import type { LanguageModel } from "ai";
import type { TinfoilProtectedOptions } from "./tinfoil.types";
import type {
  PrivacyDiagnostic,
  PrivacyEvent,
  PrivacyReport,
} from "../../privacy/privacy.types";
import {
  assertPrivacyActive,
  fetchPrivacyBytes,
  observePrivacy,
  privacyError,
  readPrivacyBody,
  sanitizePrivacyError,
} from "../../privacy/privacy.utils";
import {
  verifyTinfoilV3,
  validateTinfoilPolicy,
} from "./verification/verification";

const promptCacheSecret = randomBytes(32).toString("hex");

/**
 * Create a Tinfoil model with verified code provenance and mandatory whole-body HPKE encryption.
 * @param {TinfoilProtectedOptions} options - Credential, required protections, ownership, and resource limits.
 * @returns {LanguageModel} Model that releases authenticated completions and native tool calls.
 * @internal
 */
export function createTinfoilProtectedModel(
  options: TinfoilProtectedOptions,
): LanguageModel {
  validateTinfoilPolicy({
    reference: options.reference,
    pinnedRegisters: options.pinnedRegisters,
    freshnessMaxAgeMs: options.freshnessMaxAgeMs,
  });
  const shape = createOpenAICompatible({
    name: "tinfoil",
    baseURL: "https://inference.tinfoil.sh/v1",
    apiKey: "transport-owned",
    supportsStructuredOutputs: true,
  }).chatModel(options.modelId);

  async function invoke<Operation extends "doGenerate" | "doStream">(
    operation: Operation,
    parameters: Parameters<typeof shape.doGenerate>[0],
  ) {
    const signal = AbortSignal.any([
      AbortSignal.timeout(options.limits.requestTimeoutMs),
      ...(options.signal ? [options.signal] : []),
      ...(parameters.abortSignal ? [parameters.abortSignal] : []),
    ]);
    const requestId = randomUUID();
    const startedAt = new Date().toISOString();
    let phase: PrivacyEvent["phase"] = "preflight";
    let checks: PrivacyReport["checks"] = {
      cpu: "unavailable",
      gpu: "unavailable",
      freshness: "unavailable",
      keyBinding: "unavailable",
      responseBinding: "unavailable",
      encryption: "unavailable",
      workload: "unavailable",
    };
    let workloadMeasurements: PrivacyReport["workloadMeasurements"];
    let verificationFailureReason: string | undefined;
    let verificationSteps: PrivacyReport["verificationSteps"];
    let freshnessExpiresAt: string | undefined;
    let downstreamVerification: PrivacyReport["downstreamVerification"];
    const assertEvidenceCurrent = () => {
      assertPrivacyActive(signal);
      if (!freshnessExpiresAt || Date.parse(freshnessExpiresAt) <= Date.now()) {
        checks = { ...checks, freshness: "failed" };
        verificationSteps = { ...verificationSteps, freshness: "failed" };
        throw privacyError("PRIVACY_ATTESTATION_FAILED");
      }
    };
    const emit = (
      nextPhase: PrivacyEvent["phase"],
      report?: PrivacyReport,
      diagnostic?: PrivacyDiagnostic,
    ) => {
      phase = nextPhase;
      observePrivacy(() =>
        options.onEvent?.({
          providerId: "tinfoil",
          modelId: options.modelId,
          requestId,
          phase,
          ...(report ? { report } : {}),
          ...(diagnostic ? { diagnostic } : {}),
        }),
      );
    };
    const onDiagnostic = (diagnostic: PrivacyDiagnostic) => {
      if (
        diagnostic.operation === "cpu-verification" &&
        diagnostic.status === "failed"
      ) {
        verificationSteps = { ...verificationSteps, downstreamCpu: "failed" };
      }
      emit(
        diagnostic.operation === "attestation" ||
          diagnostic.operation === "workload-verification"
          ? "attestation"
          : phase,
        undefined,
        {
          ...diagnostic,
          ...((diagnostic.operation === "attestation" ||
            diagnostic.operation === "workload-verification") &&
          verificationSteps
            ? { verificationSteps }
            : {}),
          ...((diagnostic.operation === "attestation" ||
            diagnostic.operation === "workload-verification") &&
          diagnostic.status === "failed" &&
          verificationFailureReason
            ? { failureReason: verificationFailureReason }
            : {}),
        },
      );
    };
    const finish = (
      status: PrivacyReport["status"],
      errorCode?: PrivacyReport["errorCode"],
    ) => {
      const report: PrivacyReport = {
        providerId: "tinfoil",
        modelId: options.modelId,
        requestId,
        startedAt,
        checkedAt: new Date().toISOString(),
        requirements: options.requirements,
        status,
        checks,
        ...(verificationSteps ? { verificationSteps } : {}),
        ...(downstreamVerification
          ? {
              downstreamVerification,
              ...(downstreamVerification.gpuCount > 0
                ? { gpuAssociation: "verified-model-enclave" as const }
                : {}),
            }
          : {}),
        ...(freshnessExpiresAt ? { freshnessExpiresAt } : {}),
        ...(workloadMeasurements ? { workloadMeasurements } : {}),
        ...(errorCode ? { errorCode } : {}),
      };
      emit(status === "verified" ? "verified" : "rejected", report);
      observePrivacy(() => options.onReport?.(report));
      return {
        requestId,
        providerId: "tinfoil",
        modelId: options.modelId,
        status,
        checks: { ...checks },
        ...(downstreamVerification
          ? {
              downstreamVerification,
              ...(downstreamVerification.gpuCount > 0
                ? { gpuAssociation: "verified-model-enclave" as const }
                : {}),
            }
          : {}),
        ...(freshnessExpiresAt ? { freshnessExpiresAt } : {}),
        ...(verificationSteps
          ? { verificationSteps: { ...verificationSteps } }
          : {}),
      };
    };
    try {
      assertPrivacyActive(signal);
      emit("preflight");
      const model = createOpenAICompatible({
        name: "tinfoil",
        baseURL: "https://inference.tinfoil.sh/v1",
        apiKey: "transport-owned",
        supportsStructuredOutputs: true,
        fetch: async (
          input: Parameters<typeof fetch>[0],
          init?: Parameters<typeof fetch>[1],
        ) => {
          assertPrivacyActive(signal);
          if (
            String(input) !==
              "https://inference.tinfoil.sh/v1/chat/completions" ||
            typeof init?.body !== "string"
          ) {
            throw privacyError("PRIVACY_CONFIGURATION_ERROR");
          }
          if (Buffer.byteLength(init.body) > options.limits.maxPlaintextBytes) {
            throw privacyError("PRIVACY_LIMIT_EXCEEDED");
          }
          const requestBody = JSON.parse(init.body) as Record<string, unknown>;
          if (
            requestBody.model !== options.modelId ||
            (requestBody.stream === true) !== (operation === "doStream")
          ) {
            throw privacyError("PRIVACY_CONFIGURATION_ERROR");
          }
          const outgoing = JSON.stringify({
            ...requestBody,
            user_cache_secret:
              requestBody.user_cache_secret ||
              process.env.TINFOIL_USER_CACHE_SECRET ||
              promptCacheSecret,
          });
          if (Buffer.byteLength(outgoing) > options.limits.maxPlaintextBytes) {
            throw privacyError("PRIVACY_LIMIT_EXCEEDED");
          }
          for (let attempt = 0; attempt < 2; attempt++) {
            emit("attestation");
            verificationFailureReason = undefined;
            const verification = await verifyTinfoilV3({
              ...options,
              signal,
              onDiagnostic,
              onFailure(reason) {
                verificationFailureReason = reason;
                verificationSteps = { v3: "failed" };
              },
            });
            const expiry = verification.freshnessExpiresAt!;
            freshnessExpiresAt = expiry.toISOString();
            const measurement = verification.enclaveMeasurement;
            workloadMeasurements = {
              ...Object.fromEntries(
                Object.entries(measurement).filter(
                  ([field]) => field !== "type",
                ),
              ),
              codeDigest: verification.codeDigest,
              ...(verification.platform
                ? { platformDigest: verification.platform.digest }
                : {}),
              ...(verification.runtime
                ? { runtimeDigest: verification.runtime.digest }
                : {}),
              ...(verification.config
                ? { configDigest: verification.config.digest }
                : {}),
            };
            checks = {
              ...checks,
              cpu: "passed",
              freshness: "passed",
              keyBinding: "passed",
              workload: "passed",
            };
            verificationSteps = {
              v3: "passed",
              nonceBinding: "passed",
              provenance: "passed",
              platformPolicy: "passed",
              quote: "passed",
              keyBinding: "passed",
              freshness: "passed",
              workload: "passed",
            };
            onDiagnostic({
              operation: "workload-measurements",
              status: "succeeded",
              measurements: workloadMeasurements,
              verificationSteps,
            });
            assertEvidenceCurrent();
            downstreamVerification = undefined;
            checks = { ...checks, gpu: "unavailable" };
            let downstream;
            try {
              downstream = await tinfoilDownstream.audit({
                modelId: options.modelId,
                router: verification,
                signal,
                limits: options.limits,
                freshnessMaxAgeMs: options.freshnessMaxAgeMs,
                onDiagnostic,
              });
              downstreamVerification = downstream.report;
              freshnessExpiresAt = new Date(
                Math.min(expiry.getTime(), downstream.expiresAt),
              ).toISOString();
              checks = {
                ...checks,
                gpu: downstream.report.gpuCount > 0 ? "passed" : "unavailable",
              };
              verificationSteps = {
                ...verificationSteps,
                routerAdmission: "passed",
                downstreamKeyBinding: "passed",
                downstreamProvenance: "passed",
                downstreamCpu: "passed",
                gpuEvidence: checks.gpu,
              };
              workloadMeasurements = {
                ...workloadMeasurements,
                downstreamPoolDigest: downstream.poolDigest,
              };
              onDiagnostic({
                operation: "workload-measurements",
                status: "succeeded",
                measurements: workloadMeasurements,
                verificationSteps,
              });
            } catch (error) {
              const cpuFailed = verificationSteps?.downstreamCpu === "failed";
              checks = {
                ...checks,
                gpu: cpuFailed ? "unavailable" : "failed",
              };
              verificationSteps = {
                ...verificationSteps,
                gpuEvidence: cpuFailed ? "unavailable" : "failed",
              };
              throw error;
            }
            assertEvidenceCurrent();
            const identity = await Identity.fromPublicKeyHex(
              verification.hpkePublicKey()!,
            );
            const target = "https://inference.tinfoil.sh/v1/chat/completions";
            const { request, context } =
              await identity.encryptRequestWithContext(
                new Request(target, {
                  method: "POST",
                  redirect: "error",
                  signal,
                  headers: {
                    Authorization: `Bearer ${options.apiKey}`,
                    "Content-Type": "application/json",
                  },
                  body: outgoing,
                }),
              );
            if (!context) {
              throw privacyError("PRIVACY_BINDING_UNAVAILABLE");
            }
            assertEvidenceCurrent();
            emit("inference");
            let staleKey = false;
            const transportFetch = async (
              targetInput: Parameters<typeof fetch>[0],
              targetInit?: Parameters<typeof fetch>[1],
            ) => {
              const response = await fetch(targetInput, targetInit);
              if (
                response.status !== 422 ||
                response.headers.get("content-type")?.split(";")[0]?.trim() !==
                  PROTOCOL.PROBLEM_JSON_MEDIA_TYPE
              ) {
                return response;
              }
              const problemBytes = await readPrivacyBody(
                response,
                Math.min(options.limits.maxWireBytes, 16384),
                signal,
              );
              try {
                const problem = JSON.parse(
                  new TextDecoder().decode(problemBytes),
                ) as { type?: unknown };
                staleKey = problem.type === PROTOCOL.KEY_CONFIG_PROBLEM_TYPE;
              } catch {
                /* Invalid problem details remain an ordinary HTTP rejection. */
              }
              return new Response(problemBytes, {
                status: response.status,
                headers: response.headers,
              });
            };
            let encryptedBytes: Uint8Array;
            let wireResponse: Response;
            try {
              ({ bytes: encryptedBytes, response: wireResponse } =
                await fetchPrivacyBytes(
                  target,
                  {
                    method: "POST",
                    redirect: "error",
                    headers: request.headers,
                    body: await request.arrayBuffer(),
                  },
                  {
                    fetch: transportFetch,
                    signal,
                    maxBytes: options.limits.maxWireBytes,
                    operation: "inference",
                    onDiagnostic,
                  },
                ));
            } catch (error) {
              if (
                attempt === 0 &&
                staleKey &&
                !signal.aborted &&
                sanitizePrivacyError(error, signal).code ===
                  "PRIVACY_PROVIDER_ERROR"
              ) {
                continue;
              }
              throw error;
            }
            emit("authentication");
            let bytes: Uint8Array;
            let response: Response;
            try {
              response = await identity.decryptResponseWithContext(
                new Response(encryptedBytes, {
                  status: wireResponse.status,
                  headers: wireResponse.headers,
                }),
                context,
              );
              bytes = await readPrivacyBody(
                response,
                options.limits.maxPlaintextBytes,
                signal,
              );
            } catch (error) {
              checks = { ...checks, responseBinding: "failed" };
              const safeError = sanitizePrivacyError(error, signal);
              if (safeError.code !== "PRIVACY_PROVIDER_ERROR") {
                throw safeError;
              }
              throw privacyError("PRIVACY_RESPONSE_AUTHENTICATION_FAILED");
            }
            assertEvidenceCurrent();
            checks = {
              ...checks,
              responseBinding: "passed",
              encryption: "passed",
            };
            try {
              await downstream.assertCurrentPool();
              verificationSteps = {
                ...verificationSteps,
                admittedPoolBinding: "passed",
              };
            } catch (error) {
              checks = { ...checks, gpu: "failed" };
              verificationSteps = {
                ...verificationSteps,
                admittedPoolBinding: "failed",
              };
              throw error;
            }
            assertEvidenceCurrent();
            const headers = new Headers(response.headers);
            headers.delete("content-length");
            return new Response(bytes, { status: response.status, headers });
          }
          throw privacyError("PRIVACY_PROVIDER_ERROR");
        },
      }).chatModel(options.modelId);
      if (operation === "doGenerate") {
        const result = await model.doGenerate(parameters);
        assertEvidenceCurrent();
        if (
          !result.finishReason.raw ||
          result.finishReason.unified === "error"
        ) {
          throw privacyError("PRIVACY_INVALID_RESPONSE");
        }
        const metadata = finish("verified");
        return {
          ...result,
          providerMetadata: {
            ...result.providerMetadata,
            commaPrivacy: metadata,
          },
        };
      }
      const result = await model.doStream(parameters);
      const reader = result.stream.getReader();
      const parts: NonNullable<
        Awaited<ReturnType<typeof reader.read>>["value"]
      >[] = [];
      let finished = false;
      try {
        while (true) {
          assertPrivacyActive(signal);
          const part = await reader.read();
          if (part.done) {
            break;
          }
          if (part.value.type === "error") {
            throw privacyError("PRIVACY_INVALID_RESPONSE");
          }
          if (part.value.type === "finish") {
            finished =
              !!part.value.finishReason.raw &&
              part.value.finishReason.unified !== "error";
          }
          parts.push(part.value);
        }
      } finally {
        await reader.cancel().catch(() => {});
        reader.releaseLock();
      }
      if (!finished) {
        throw privacyError("PRIVACY_INVALID_RESPONSE");
      }
      assertEvidenceCurrent();
      const metadata = finish("verified");
      return {
        ...result,
        stream: new ReadableStream({
          start(controller) {
            for (const part of parts) {
              controller.enqueue(
                part.type === "finish"
                  ? {
                      ...part,
                      providerMetadata: {
                        ...part.providerMetadata,
                        commaPrivacy: metadata,
                      },
                    }
                  : part,
              );
            }
            controller.close();
          },
        }),
      };
    } catch (error) {
      const safeError = sanitizePrivacyError(error, signal);
      finish("rejected", safeError.code);
      throw safeError;
    }
  }
  return {
    specificationVersion: "v3",
    provider: "tinfoil.protected",
    modelId: options.modelId,
    supportedUrls: {},
    doGenerate: (parameters) =>
      invoke("doGenerate", parameters) as ReturnType<typeof shape.doGenerate>,
    doStream: (parameters) =>
      invoke("doStream", parameters) as ReturnType<typeof shape.doStream>,
  };
}
