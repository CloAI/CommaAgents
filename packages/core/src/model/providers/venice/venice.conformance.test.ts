import { expect, test } from "bun:test";
import { randomBytes } from "node:crypto";
import { z } from "zod";
import {
  DEFAULT_NRAS_URL,
  DEFAULT_PCCS_URL,
  DEFAULT_PRIVACY_LIMITS,
} from "../../privacy/privacy.constants";
import { fetchPrivacyJSON } from "../../privacy/privacy.utils";
import {
  verifyCpuEvidence,
  verifyGpuEvidence,
} from "../../privacy/verification/verification";

const modelId = process.env.COMMA_PRIVACY_LIVE_MODEL;

test.skipIf(!modelId)(
  "should independently verify live public Venice CPU and GPU evidence without generation",
  async () => {
    if (!modelId)
      throw new Error(
        "Set COMMA_PRIVACY_LIVE_MODEL to a public Venice model ID.",
      );
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
    };
    const context = {
      signal,
      fetch: globalThis.fetch,
      pccsURL: DEFAULT_PCCS_URL,
      nrasURL: DEFAULT_NRAS_URL,
      maxEvidenceBytes: DEFAULT_PRIVACY_LIMITS.maxEvidenceBytes,
    };
    await verifyCpuEvidence(evidence, context);
    await verifyGpuEvidence(evidence, context);
    // Successful components are not an assertion of CPU/GPU association or response binding.
  },
  65_000,
);
