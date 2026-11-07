import { describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { secp256k1 } from "@noble/curves/secp256k1.js";
import { exportJWK, generateKeyPair, SignJWT } from "jose";
import type { JWTPayload } from "jose";
import {
  parseNvidiaTokens,
  verifyCpuEvidence,
  verifyGpuEvidence,
  verifyNvidiaTokens,
} from "./verification";
import {
  fetchVerificationResponse,
  readVerificationResponse,
} from "./verification.utils";
import type { VerificationContext } from "./verification.types";

const expectedNonce = new Uint8Array(32).fill(7);
const issuer = "https://nras.example.test";

/** Create genuinely signed NRAS-shaped claims using an isolated test trust root.
 * @param {object} [overrides] - Authenticated claims changed for rejection cases.
 * @returns {Promise<object>} Signed tokens and their test trust root.
 */
async function tokenFixture(overrides?: {
  readonly device?: JWTPayload;
  readonly overall?: JWTPayload;
}) {
  const keyPair = await generateKeyPair("ES384", { extractable: true });
  const publicKey = await exportJWK(keyPair.publicKey);
  const keySet = { keys: [{ ...publicKey, kid: "test-nras" }] };
  const timestamp = Math.floor(Date.now() / 1000);
  const common = {
    iss: issuer,
    eat_nonce: Buffer.from(expectedNonce).toString("hex"),
    iat: timestamp,
    nbf: timestamp - 1,
    exp: timestamp + 3600,
  };
  const chain = {
    "x-nvidia-cert-status": "valid",
    "x-nvidia-cert-ocsp-status": "good",
    "x-nvidia-cert-expiration-date": new Date(
      Date.now() + 3600000,
    ).toISOString(),
  };
  const device = await new SignJWT({
    ...common,
    secboot: true,
    dbgstat: "disabled",
    measres: "success",
    ueid: "test-gpu-0",
    "x-nvidia-gpu-attestation-report-signature-verified": true,
    "x-nvidia-gpu-attestation-report-nonce-match": true,
    "x-nvidia-gpu-attestation-report-parsed": true,
    "x-nvidia-gpu-driver-rim-signature-verified": true,
    "x-nvidia-gpu-vbios-rim-signature-verified": true,
    "x-nvidia-gpu-arch-check": true,
    "x-nvidia-gpu-driver-rim-schema-validated": true,
    "x-nvidia-gpu-vbios-rim-schema-validated": true,
    "x-nvidia-gpu-driver-rim-fetched": true,
    "x-nvidia-gpu-vbios-rim-fetched": true,
    "x-nvidia-gpu-driver-rim-version-match": true,
    "x-nvidia-gpu-vbios-rim-version-match": true,
    "x-nvidia-gpu-driver-rim-measurements-available": true,
    "x-nvidia-gpu-vbios-rim-measurements-available": true,
    "x-nvidia-gpu-vbios-index-no-conflict": true,
    "x-nvidia-gpu-attestation-report-cert-chain-fwid-match": true,
    "x-nvidia-gpu-attestation-report-cert-chain": chain,
    "x-nvidia-gpu-driver-rim-cert-chain": chain,
    "x-nvidia-gpu-vbios-rim-cert-chain": chain,
    ...overrides?.device,
  })
    .setProtectedHeader({ alg: "ES384", kid: "test-nras" })
    .sign(keyPair.privateKey);
  const overall = await new SignJWT({
    ...common,
    sub: "NVIDIA-PLATFORM-ATTESTATION",
    "x-nvidia-overall-att-result": true,
    submods: {
      "GPU-0": [
        "DIGEST",
        ["SHA-256", createHash("sha256").update(device).digest("hex")],
      ],
    },
    ...overrides?.overall,
  })
    .setProtectedHeader({ alg: "ES384", kid: "test-nras" })
    .sign(keyPair.privateKey);
  return { tokens: { overall, devices: { "GPU-0": device } }, keySet };
}

/** Build the production HTTP context around an explicitly supplied test service.
 * @param {typeof fetch} fetchService - Test service at the production HTTP boundary.
 * @param {AbortSignal} [signal] - Owning request cancellation.
 * @returns {VerificationContext} Trusted services and limits for one test.
 */
function context(
  fetchService: typeof fetch,
  signal = new AbortController().signal,
): VerificationContext {
  return {
    signal,
    fetch: fetchService,
    pccsURL: "https://pccs.example.test",
    nrasURL: `${issuer}/v4/attest/gpu`,
    maxEvidenceBytes: 2 * 1024 * 1024,
  };
}

describe("hardware verification", () => {
  test("should authenticate overall and device signatures with matching signed nonce and digest", async () => {
    const fixture = await tokenFixture();
    const verified = await verifyNvidiaTokens(
      fixture.tokens,
      expectedNonce,
      fixture.keySet,
      issuer,
      1,
    );
    expect(verified.expiresAt).toBeLessThanOrEqual(Date.now() + 120000);
    expect(verified.deviceIds).toEqual(["test-gpu-0"]);
  });

  test("should reject a replaced device token even when its own signature is valid", async () => {
    const fixture = await tokenFixture();
    const replacement = await tokenFixture();
    await expect(
      verifyNvidiaTokens(
        { ...fixture.tokens, devices: replacement.tokens.devices },
        expectedNonce,
        fixture.keySet,
        issuer,
        1,
      ),
    ).rejects.toThrow();
  });

  test("should reject an untrusted signature key", async () => {
    const fixture = await tokenFixture();
    const otherRoot = await tokenFixture();
    await expect(
      verifyNvidiaTokens(
        fixture.tokens,
        expectedNonce,
        otherRoot.keySet,
        issuer,
        1,
      ),
    ).rejects.toThrow();
  });

  test("should reject failure, expired, replayed, debug, and incomplete signed claims", async () => {
    for (const overrides of [
      { overall: { "x-nvidia-overall-att-result": false } },
      { overall: { exp: 1 } },
      { overall: { eat_nonce: "00".repeat(32) } },
      { overall: { iss: "https://other.example.test" } },
      { device: { dbgstat: "enabled" } },
      { device: { secboot: false } },
      { device: { measres: "failure" } },
      {
        device: { "x-nvidia-gpu-attestation-report-signature-verified": false },
      },
      { device: { "x-nvidia-gpu-attestation-report-cert-chain": null } },
      { device: { eat_nonce: "00".repeat(32) } },
    ]) {
      const fixture = await tokenFixture(overrides);
      await expect(
        verifyNvidiaTokens(
          fixture.tokens,
          expectedNonce,
          fixture.keySet,
          issuer,
          1,
        ),
      ).rejects.toThrow();
    }
  });

  test("should reject missing or added GPU submodules", async () => {
    const fixture = await tokenFixture();
    await expect(
      verifyNvidiaTokens(
        fixture.tokens,
        expectedNonce,
        fixture.keySet,
        issuer,
        2,
      ),
    ).rejects.toThrow();
    await expect(
      verifyNvidiaTokens(
        { ...fixture.tokens, devices: {} },
        expectedNonce,
        fixture.keySet,
        issuer,
        1,
      ),
    ).rejects.toThrow();
  });

  test("should parse the detached NRAS envelope and reject provider verdicts", () => {
    expect(
      parseNvidiaTokens([["JWT", "overall"], { "GPU-0": "device" }]),
    ).toEqual({ overall: "overall", devices: { "GPU-0": "device" } });
    expect(() =>
      parseNvidiaTokens({
        verified: true,
        server_verification: { nvidia: { valid: true } },
      }),
    ).toThrow();
    expect(() => parseNvidiaTokens([["JWT", "overall"], {}])).toThrow();
  });

  test("should fetch only trusted NRAS and JWKS endpoints with cancellation and no redirects", async () => {
    const fixture = await tokenFixture();
    const calls: { url: string; options?: RequestInit }[] = [];
    const service = Object.assign(
      async (input: Parameters<typeof fetch>[0], options?: RequestInit) => {
        calls.push({ url: String(input), options });
        return String(input).endsWith("/jwks.json")
          ? Response.json(fixture.keySet)
          : Response.json([
              ["JWT", fixture.tokens.overall],
              fixture.tokens.devices,
            ]);
      },
      { preconnect: fetch.preconnect },
    );
    const requestContext = context(service);
    await verifyGpuEvidence(
      {
        quote: new Uint8Array(),
        signingPublicKey: new Uint8Array(),
        nonce: expectedNonce,
        gpuEvidence: {
          nonce: Buffer.from(expectedNonce).toString("hex"),
          arch: "HOPPER",
          evidence_list: [{ certificate: "certificate", evidence: "evidence" }],
        },
      },
      requestContext,
    );
    expect(calls.map((call) => call.url)).toEqual([
      `${issuer}/v4/attest/gpu`,
      `${issuer}/.well-known/jwks.json`,
    ]);
    expect(
      calls.every(
        (call) =>
          call.options?.redirect === "error" &&
          call.options.signal === requestContext.signal,
      ),
    ).toBe(true);
  });

  test("should reject malformed CPU quotes before fetching collateral", async () => {
    const calls: string[] = [];
    const service = Object.assign(
      async (input: Parameters<typeof fetch>[0]) => {
        calls.push(String(input));
        return new Response(null, { status: 500 });
      },
      { preconnect: fetch.preconnect },
    );
    await expect(
      verifyCpuEvidence(
        {
          quote: new Uint8Array(632),
          signingPublicKey: secp256k1.getPublicKey(
            new Uint8Array(32).fill(1),
            false,
          ),
          nonce: expectedNonce,
          gpuEvidence: {},
        },
        context(service),
      ),
    ).rejects.toThrow();
    expect(calls).toEqual([]);
  });

  test("should bound response bytes even when content-length is omitted", async () => {
    const requestContext = { ...context(fetch), maxEvidenceBytes: 3 };
    await expect(
      readVerificationResponse(new Response(new Uint8Array(4)), requestContext),
    ).rejects.toMatchObject({ code: "PRIVACY_LIMIT_EXCEEDED" });
  });

  test("should cancel a stalled verification response body", async () => {
    const controller = new AbortController();
    let cancelled = false;
    const body = new ReadableStream<Uint8Array>({
      cancel() {
        cancelled = true;
      },
    });
    const read = readVerificationResponse(
      new Response(body),
      context(fetch, controller.signal),
    );
    controller.abort();
    await expect(read).rejects.toThrow();
    expect(cancelled).toBe(true);
  });
  test("should enforce the verification deadline while reading a stalled body", async () => {
    let cancelled = false;
    const service = Object.assign(
      async () =>
        new Response(
          new ReadableStream({
            cancel() {
              cancelled = true;
            },
          }),
        ),
      { preconnect: fetch.preconnect },
    );
    await expect(
      fetchVerificationResponse("https://verifier.example/response", {
        ...context(service),
        verificationTimeoutMs: 5,
      }),
    ).rejects.toMatchObject({ code: "PRIVACY_TIMEOUT" });
    expect(cancelled).toBe(true);
  });
});
