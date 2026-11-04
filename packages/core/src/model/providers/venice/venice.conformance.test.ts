import type { VeniceWorkloadMeasurements } from "./venice.types";
import { DEFAULT_NRAS_URL, DEFAULT_PCCS_URL } from "./venice.constants";
import { expect, test } from "bun:test";
import { randomBytes } from "node:crypto";
import { z } from "zod";
import { DEFAULT_PRIVACY_LIMITS } from "../../privacy/privacy.constants";
import { fetchPrivacyJSON } from "../../privacy/privacy.utils";
import { verifyHardwareEvidence } from "./verification/verification";
import type { PrivacyDiagnostic } from "../../privacy/privacy.types";
import { veniceWorkloadEvidence } from "./venice.utils";

const modelId = process.env.COMMA_PRIVACY_LIVE_MODEL;

test.skipIf(!modelId)(
  "should independently authenticate live hardware and software evidence but require explicit workload approval",
  async () => {
    if (!modelId) {
      throw new Error(
        "Set COMMA_PRIVACY_LIVE_MODEL to a public Venice model ID.",
      );
    }
    const nonce = randomBytes(32);
    const signal = AbortSignal.timeout(60_000);
    const url = new URL("https://api.venice.ai/api/v1/tee/attestation");
    url.searchParams.set("model", modelId);
    url.searchParams.set("nonce", nonce.toString("hex"));
    const payload = z
      .object({
        model: z.string(),
        nonce: z.string(),
        intel_quote: z.string(),
        signing_key: z.string(),
        nvidia_payload: z.unknown(),
        event_log: z.unknown().optional(),
        info: z.object({ tcb_info: z.unknown().optional() }).optional(),
        compose_manager_attestation: z.unknown().optional(),
      })
      .parse(
        await fetchPrivacyJSON(
          url.toString(),
          {},
          DEFAULT_PRIVACY_LIMITS.maxEvidenceBytes,
          signal,
        ),
      );
    expect(payload.model).toBe(modelId);
    expect(payload.nonce).toBe(nonce.toString("hex"));
    const quote = /^[\da-f]+$/i.test(payload.intel_quote)
      ? Buffer.from(payload.intel_quote, "hex")
      : Buffer.from(payload.intel_quote, "base64");
    const evidence = {
      quote,
      signingPublicKey: Buffer.from(
        payload.signing_key.replace(/^0x/, ""),
        "hex",
      ),
      nonce,
      gpuEvidence: payload.nvidia_payload,
      workload: veniceWorkloadEvidence(payload),
    };
    const diagnostics: PrivacyDiagnostic[] = [];
    let measurements: VeniceWorkloadMeasurements | undefined;
    const context = {
      signal,
      fetch: globalThis.fetch,
      pccsURL: DEFAULT_PCCS_URL,
      nrasURL: DEFAULT_NRAS_URL,
      maxEvidenceBytes: DEFAULT_PRIVACY_LIMITS.maxEvidenceBytes,
      onDiagnostic: (diagnostic: PrivacyDiagnostic) => {
        diagnostics.push(diagnostic);
      },
      onMeasurements: (value: VeniceWorkloadMeasurements) => {
        measurements = value;
      },
    };
    await expect(
      verifyHardwareEvidence(evidence, context),
    ).rejects.toMatchObject({ code: "PRIVACY_WORKLOAD_UNTRUSTED" });
    for (const operation of [
      "cpu-verification",
      "gpu-verification",
      "workload-measurements",
      "compose-manager-verification",
    ]) {
      expect(
        diagnostics.some(
          (diagnostic) =>
            diagnostic.operation === operation &&
            diagnostic.status === "succeeded",
        ),
      ).toBe(true);
    }
    expect(measurements?.composeHash).toMatch(/^[a-f0-9]{64}$/);
    expect(measurements?.composeManagerActionsHash).toMatch(/^[a-f0-9]{64}$/);
    // These observed values identify software; the test never turns them into approved policy.
  },
  65_000,
);
