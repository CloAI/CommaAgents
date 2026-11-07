import { randomBytes } from "node:crypto";
import { z } from "zod";
import {
  assertPrivacyActive,
  fetchPrivacyBytes,
  privacyError,
  tracePrivacyCheck,
} from "../../../privacy/privacy.utils";
import {
  parseNvidiaTokens,
  verifyNvidiaTokens,
} from "../../../privacy/hardware/nvidia/nvidia";
import { parseTinfoilDocument } from "../verification/owned/owned.document";
import {
  parseTinfoilJSON,
  decodeTinfoilBase64,
} from "../verification/owned/owned.json";
import {
  devicesSchema,
  materialSchema,
} from "../verification/owned/owned.schemas";
import { tinfoilVerifier } from "../verification/owned/owned";
import { awaitTinfoilOperation } from "../tinfoil.utils";
import { fetchTinfoilAuthenticatedEvidence } from "./downstream.transport";
import { parseTinfoilAdmittedPool } from "./downstream.manifest";
import type {
  TinfoilDownstreamOptions,
  TinfoilDownstreamAudit,
  TinfoilAdmittedEnclave,
} from "./downstream.types";

const manifestURL = "https://inference.tinfoil.sh/.well-known/tinfoil-proxy";
const nrasURL = "https://nras.attestation.nvidia.com/v4/attest/gpu";
const issuer = "https://nras.attestation.nvidia.com";
const gpuSchema = z
  .object({
    arch: z.string().min(1).max(32),
    certificate: z.string().min(1),
    evidence: z.string().min(1),
    nonce: z.string().regex(/^[0-9a-f]{64}$/),
  })
  .strict();

/** Verify fresh GPU reports from an identity admitted by the authenticated router.
 * @param {TinfoilAdmittedEnclave} enclave - Router admission constraints, independently checked against the CPU quote.
 * @param {string} repo - Model-to-repository mapping authenticated by the router.
 * @param {TinfoilDownstreamOptions} options - Request ownership and limits.
 * @returns {Promise<object>} Authenticated NVIDIA identities and earliest evidence expiry.
 */
async function verifyEnclave(
  enclave: TinfoilAdmittedEnclave,
  repo: string,
  options: TinfoilDownstreamOptions,
) {
  const nonce = randomBytes(32);
  const url = `https://${enclave.hostname}/.well-known/tinfoil-attestation?nonce=${nonce.toString("hex")}`;
  const raw = await fetchTinfoilAuthenticatedEvidence(
    url,
    enclave.hpkeKey,
    options,
  );
  const { document, hpkeKey } = parseTinfoilDocument(raw, nonce);
  const material = materialSchema.parse(
    parseTinfoilJSON(decodeTinfoilBase64(document.crypto_material)),
  );
  const tls = material.items.find(
    (item) =>
      item.id === "tls" &&
      item.format === "https://tinfoil.sh/key/spki-fp-sha256/v1",
  );
  if (hpkeKey !== enclave.hpkeKey || tls?.data !== enclave.tlsKey) {
    throw privacyError("PRIVACY_BINDING_UNAVAILABLE");
  }
  let cpuFailureReason: string | undefined;
  const cpu = await tracePrivacyCheck(
    "cpu-verification",
    {
      signal: options.signal,
      onDiagnostic: (diagnostic) =>
        options.onDiagnostic?.({
          ...diagnostic,
          endpoint: url.split("?")[0],
          verificationSteps: {
            downstreamCpu:
              diagnostic.status === "succeeded"
                ? "passed"
                : diagnostic.status === "failed"
                  ? "failed"
                  : "unavailable",
          },
          ...(cpuFailureReason ? { failureReason: cpuFailureReason } : {}),
        }),
    },
    async () => {
      try {
        return await tinfoilVerifier.verify(raw, {
          nonce,
          reference: `${repo}@${enclave.codeTag}`,
          verificationTime: new Date(),
          freshnessMaxAgeMs: options.freshnessMaxAgeMs,
          profile: "model",
        });
      } catch (error) {
        const layer =
          error instanceof Error &&
          "layer" in error &&
          typeof error.layer === "string" &&
          ["envelope", "provenance", "quote", "policy"].includes(error.layer)
            ? error.layer
            : "verification";
        cpuFailureReason = `downstream-cpu-${layer}-rejected`;
        throw privacyError("PRIVACY_ATTESTATION_FAILED");
      }
    },
  );
  if (cpu.hpkePublicKey() !== enclave.hpkeKey) {
    throw privacyError("PRIVACY_BINDING_UNAVAILABLE");
  }
  let expiresAt = Math.min(
    enclave.expiresAt,
    cpu.freshnessExpiresAt.getTime(),
    options.router.freshnessExpiresAt.getTime(),
  );
  const expected = cpu.gpuCount;
  const devices = devicesSchema.parse(
    parseTinfoilJSON(decodeTinfoilBase64(document.device_evidence)),
  ).items;
  if (devices.length !== expected) {
    throw privacyError("PRIVACY_GPU_EVIDENCE_UNAVAILABLE");
  }
  const groups = new Map<string, z.infer<typeof gpuSchema>[]>();
  for (const device of devices) {
    if (
      device.kind !== "gpu" ||
      device.vendor !== "nvidia" ||
      device.format !== "https://tinfoil.sh/format/nvidia-gpu-evidence/v1"
    ) {
      throw privacyError("PRIVACY_GPU_EVIDENCE_UNAVAILABLE");
    }
    const gpu = gpuSchema.parse(device.evidence);
    if (gpu.nonce !== nonce.toString("hex")) {
      throw privacyError("PRIVACY_ATTESTATION_FAILED");
    }
    const group = groups.get(gpu.arch) ?? [];
    group.push(gpu);
    groups.set(gpu.arch, group);
  }
  const ids = new Set<string>();
  for (const [arch, evidence] of groups) {
    assertPrivacyActive(options.signal);
    const body = JSON.stringify({
      nonce: nonce.toString("hex"),
      arch,
      evidence_list: evidence.map(({ certificate, evidence, arch }) => ({
        certificate,
        evidence,
        arch,
      })),
    });
    if (Buffer.byteLength(body) > options.limits.maxEvidenceBytes) {
      throw privacyError("PRIVACY_LIMIT_EXCEEDED");
    }
    const service = {
      fetch: globalThis.fetch,
      signal: options.signal,
      maxBytes: options.limits.maxEvidenceBytes,
      operation: "verification-http" as const,
      onDiagnostic: options.onDiagnostic,
    };
    const response = await fetchPrivacyBytes(
      nrasURL,
      { method: "POST", headers: { "Content-Type": "application/json" }, body },
      service,
    );
    const tokens = parseNvidiaTokens(parseTinfoilJSON(response.bytes));
    const jwks = await fetchPrivacyBytes(
      `${issuer}/.well-known/jwks.json`,
      {},
      service,
    );
    const keys = z
      .object({
        keys: z
          .array(z.object({ kty: z.string() }).passthrough())
          .min(1)
          .max(1024),
      })
      .passthrough()
      .parse(parseTinfoilJSON(jwks.bytes));
    const verified = await verifyNvidiaTokens(
      tokens,
      nonce,
      keys,
      issuer,
      evidence.length,
    );
    expiresAt = Math.min(expiresAt, verified.expiresAt);
    for (const id of verified.deviceIds) {
      if (ids.has(id)) {
        throw privacyError("PRIVACY_ATTESTATION_FAILED");
      }
      ids.add(id);
    }
  }
  if (
    ids.size !== expected ||
    !Number.isFinite(expiresAt) ||
    expiresAt <= Date.now()
  ) {
    throw privacyError("PRIVACY_ATTESTATION_FAILED");
  }
  return { expiresAt, deviceIds: [...ids] };
}

/** Authenticate the router's admitted pool and independently validate every candidate's fresh NVIDIA reports.
 * @param {TinfoilDownstreamOptions} options - Verified router identity, exact selected model, deadlines, and observers.
 * @returns {Promise<TinfoilDownstreamAudit>} Pool appraisal with a post-inference consistency check.
 */
export async function auditTinfoilDownstream(
  options: TinfoilDownstreamOptions,
): Promise<TinfoilDownstreamAudit> {
  const signal = options.signal;
  let failedEndpoint: string | undefined;
  let failureReason = "router-admission-rejected";
  return tracePrivacyCheck(
    "gpu-verification",
    {
      signal,
      onDiagnostic: (diagnostic) =>
        options.onDiagnostic?.({
          ...diagnostic,
          ...(diagnostic.status === "failed"
            ? {
                failureReason,
                ...(failedEndpoint ? { endpoint: failedEndpoint } : {}),
              }
            : {}),
        }),
    },
    async () => {
      const routerKey = options.router.hpkePublicKey();
      if (!routerKey) {
        throw privacyError("PRIVACY_BINDING_UNAVAILABLE");
      }
      const owned = { ...options, signal };
      try {
        const manifest = await fetchTinfoilAuthenticatedEvidence(
          manifestURL,
          routerKey,
          owned,
        );
        const pool = parseTinfoilAdmittedPool(manifest, options.modelId);
        let expiresAt = options.router.freshnessExpiresAt.getTime();
        const devices = new Set<string>();
        const poolAbort = new AbortController();
        let next = 0;
        let failure: unknown;
        const results = await Promise.allSettled(
          Array.from(
            { length: Math.min(4, pool.enclaves.length) },
            async () => {
              while (next < pool.enclaves.length && !poolAbort.signal.aborted) {
                const enclave = pool.enclaves[next++]!;
                const nodeSignal = AbortSignal.any([
                  signal,
                  poolAbort.signal,
                  AbortSignal.timeout(options.limits.verificationTimeoutMs),
                ]);
                try {
                  const result = await awaitTinfoilOperation(
                    () =>
                      verifyEnclave(enclave, pool.repo, {
                        ...owned,
                        signal: nodeSignal,
                      }),
                    nodeSignal,
                  );
                  assertPrivacyActive(nodeSignal);
                  expiresAt = Math.min(expiresAt, result.expiresAt);
                  for (const id of result.deviceIds) {
                    if (devices.has(id)) {
                      throw privacyError("PRIVACY_ATTESTATION_FAILED");
                    }
                    devices.add(id);
                  }
                } catch (error) {
                  if (failure === undefined) {
                    failedEndpoint = `https://${enclave.hostname}/.well-known/tinfoil-attestation`;
                    failureReason =
                      error instanceof Error &&
                      "code" in error &&
                      error.code === "PRIVACY_TIMEOUT"
                        ? "admitted-enclave-verification-timeout"
                        : "admitted-enclave-verification-rejected";
                  }
                  failure ??= error;
                  poolAbort.abort();
                  throw error;
                }
              }
            },
          ),
        );
        if (results.some((result) => result.status === "rejected")) {
          throw failure;
        }
        assertPrivacyActive(signal);
        return Object.freeze({
          expiresAt,
          poolDigest: pool.digest,
          report: Object.freeze({
            scope: "router-admitted-pool" as const,
            identitySource: "client-verified-cpu" as const,
            modelRepository: pool.repo,
            enclaveCount: pool.enclaves.length,
            gpuCount: devices.size,
          }),
          async assertCurrentPool() {
            assertPrivacyActive(options.signal);
            if (expiresAt <= Date.now()) {
              throw privacyError("PRIVACY_ATTESTATION_FAILED");
            }
            const latest = parseTinfoilAdmittedPool(
              await fetchTinfoilAuthenticatedEvidence(
                manifestURL,
                routerKey,
                options,
              ),
              options.modelId,
            );
            if (
              latest.digest !== pool.digest ||
              latest.enclaves.some((e) => e.expiresAt <= Date.now())
            ) {
              throw privacyError("PRIVACY_BINDING_UNAVAILABLE");
            }
            assertPrivacyActive(options.signal);
            if (expiresAt <= Date.now()) {
              throw privacyError("PRIVACY_ATTESTATION_FAILED");
            }
          },
        });
      } catch (error) {
        assertPrivacyActive(signal);
        // Preserve only our stable privacy codes; evidence, provenance errors and verifier text stay private.
        if (
          error instanceof Error &&
          "code" in error &&
          typeof error.code === "string" &&
          error.code.startsWith("PRIVACY_")
        ) {
          throw error;
        }
        throw privacyError("PRIVACY_ATTESTATION_FAILED");
      }
    },
  );
}

/** Provider-owned downstream audit boundary. @internal */
export const tinfoilDownstream = { audit: auditTinfoilDownstream };
