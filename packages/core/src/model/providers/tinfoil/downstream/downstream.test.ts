import { afterEach, beforeEach, describe, expect, it, spyOn } from "bun:test";
import { createHash } from "node:crypto";
import { generateKeyPair, exportJWK, SignJWT, type JWTPayload } from "jose";
import {
  Identity,
  PROTOCOL,
  deriveResponseKeys,
  encryptChunk,
  EXPORT_LABEL,
  EXPORT_LENGTH,
  type RequestContext,
} from "ehbp";
import { tinfoilVerifier } from "../verification/owned/owned";
import routerFixture from "../verification/production-v3.fixture.json";
import { documentSchema } from "../verification/owned/owned.schemas";
import { auditTinfoilDownstream } from "./downstream";
import { parseTinfoilAdmittedPool } from "./downstream.manifest";
import { DEFAULT_PRIVACY_LIMITS } from "../../../privacy/privacy.constants";
import type { TinfoilDownstreamOptions } from "./downstream.types";

const originalFetch = globalThis.fetch;
const originalEncrypt = Identity.prototype.encryptRequestWithContext;
const hostname = "model-0.tinfoil.containers.tinfoil.dev";
let routerKey: string;
let nodeKey: string;
let calls: string[];
let requestContext: RequestContext | null;
let manifest: ReturnType<typeof makeManifest>;
let cpu: ReturnType<typeof spyOn<typeof tinfoilVerifier, "verify">>;
let keyPair: Awaited<ReturnType<typeof generateKeyPair>>;
let modes: {
  plaintext?: boolean;
  tampered?: boolean;
  wrongNonce?: boolean;
  wrongKey?: boolean;
  missingGpu?: boolean;
  duplicateGpu?: boolean;
  gpuFailure?: boolean;
  badSignature?: boolean;
  expired?: boolean;
  unknownVendor?: boolean;
  badCount?: boolean;
  manyKeys?: boolean;
};
let expectedNonce: string;

/** Simulate authenticated router state for a single admitted model candidate.
 * @returns {object} Public admission metadata.
 */
function makeManifest() {
  return {
    models: {
      model: {
        repo: "tinfoilsh/model",
        enclaves: {
          [hostname]: {
            hpke_key: nodeKey,
            tls_key_fp: "aa".repeat(32),
            predicate: "https://tinfoil.sh/predicate/sev-snp-guest/v2",
          },
        },
        verification: {
          observed_at: new Date().toISOString(),
          hosts: {
            [hostname]: {
              last_success: new Date().toISOString(),
              expires_at: new Date(Date.now() + 60000).toISOString(),
              code_tag: "v1",
            },
          },
        },
      },
    },
  };
}

/** Encrypt a response under this evidence request's real HPKE context.
 * @param {unknown} payload - Public evidence payload.
 * @returns {Promise<Response>} Authenticated evidence response.
 */
async function encrypted(payload: unknown) {
  if (!requestContext) {
    throw new Error("Missing evidence context");
  }
  if (modes.plaintext) {
    return Response.json(payload);
  }
  const nonce = crypto.getRandomValues(new Uint8Array(32));
  const secret = await requestContext.senderContext.Export(
    new TextEncoder().encode(EXPORT_LABEL),
    EXPORT_LENGTH,
  );
  const keys = await deriveResponseKeys(
    secret,
    requestContext.requestEnc,
    nonce,
  );
  const ciphertext = await encryptChunk(
    keys,
    0,
    new TextEncoder().encode(JSON.stringify(payload)),
  );
  if (modes.tampered) {
    ciphertext[ciphertext.length - 1]! ^= 1;
  }
  const frame = new Uint8Array(ciphertext.length + 4);
  new DataView(frame.buffer).setUint32(0, ciphertext.length, false);
  frame.set(ciphertext, 4);
  return new Response(frame, {
    headers: {
      "content-type": "application/json",
      [PROTOCOL.RESPONSE_NONCE_HEADER]: Buffer.from(nonce).toString("hex"),
    },
  });
}

/** Generate genuine signed NVIDIA-shaped aggregate and per-device tokens.
 * @returns {Promise<unknown>} Detached token envelope from the simulated trusted NRAS service.
 */
async function tokens() {
  const now = Math.floor(Date.now() / 1000);
  const common = {
    iss: "https://nras.attestation.nvidia.com",
    iat: now,
    nbf: now - 1,
    exp: modes.expired ? now - 1 : now + 120,
    eat_nonce: expectedNonce,
  };
  const chain = {
    "x-nvidia-cert-status": "valid",
    "x-nvidia-cert-ocsp-status": "good",
    "x-nvidia-cert-expiration-date": new Date(
      Date.now() + 3600000,
    ).toISOString(),
  };
  const devices: Record<string, string> = {};
  const submods: Record<string, unknown> = {};
  for (let index = 0; index < 4; index++) {
    const claims: JWTPayload = {
      ...common,
      ueid: `GPU-${modes.duplicateGpu ? 0 : index}`,
      secboot: !modes.gpuFailure,
      dbgstat: "disabled",
      measres: "success",
    };
    for (const claim of [
      "attestation-report-signature-verified",
      "attestation-report-nonce-match",
      "attestation-report-parsed",
      "driver-rim-signature-verified",
      "vbios-rim-signature-verified",
      "arch-check",
      "driver-rim-schema-validated",
      "vbios-rim-schema-validated",
      "driver-rim-fetched",
      "vbios-rim-fetched",
      "driver-rim-version-match",
      "vbios-rim-version-match",
      "driver-rim-measurements-available",
      "vbios-rim-measurements-available",
      "vbios-index-no-conflict",
      "attestation-report-cert-chain-fwid-match",
    ]) {
      claims[`x-nvidia-gpu-${claim}`] = true;
    }
    for (const claim of [
      "attestation-report-cert-chain",
      "driver-rim-cert-chain",
      "vbios-rim-cert-chain",
    ]) {
      claims[`x-nvidia-gpu-${claim}`] = chain;
    }
    let token = await new SignJWT(claims)
      .setProtectedHeader({ alg: "ES384", kid: "test" })
      .sign(keyPair.privateKey);
    if (modes.badSignature) {
      token = `${token.slice(0, -8)}AAAAAAAA`;
    }
    devices[`GPU-${index}`] = token;
    submods[`GPU-${index}`] = [
      "DIGEST",
      ["SHA-256", createHash("sha256").update(token).digest("hex")],
    ];
  }
  const overall = await new SignJWT({
    ...common,
    sub: "NVIDIA-PLATFORM-ATTESTATION",
    "x-nvidia-overall-att-result": true,
    submods,
  })
    .setProtectedHeader({ alg: "ES384", kid: "test" })
    .sign(keyPair.privateKey);
  return [["JWT", overall], devices];
}

/** Bind a simulated measured node's evidence to the received request nonce and admitted keys.
 * @returns {object} V3 envelope authenticated by the node's HPKE response.
 */
function nodeDocument() {
  const doc = documentSchema.parse(
    JSON.parse(Buffer.from(routerFixture.documentBase64, "base64").toString()),
  );
  const nonce = modes.wrongNonce ? "ff".repeat(32) : expectedNonce;
  const material = Buffer.from(
    JSON.stringify({
      format: "https://tinfoil.sh/crypto-material/v1",
      items: [
        {
          id: "hpke",
          format: "https://tinfoil.sh/key/x25519-hpke/v1",
          data: modes.wrongKey ? "bb".repeat(32) : nodeKey,
        },
        {
          id: "tls",
          format: "https://tinfoil.sh/key/spki-fp-sha256/v1",
          data: "aa".repeat(32),
        },
      ],
    }),
  );
  const devices = Buffer.from(
    JSON.stringify({
      format: "https://tinfoil.sh/device-evidence/v1",
      items: Array.from({ length: modes.missingGpu ? 0 : 4 }, (_, i) => ({
        id: `gpu${i}`,
        kind: "gpu",
        vendor: modes.unknownVendor ? "other" : "nvidia",
        format: "https://tinfoil.sh/format/nvidia-gpu-evidence/v1",
        evidence: {
          arch: "HOPPER",
          certificate: "public-test-certificate",
          evidence: "public-test-evidence",
          nonce,
        },
      })),
    }),
  );
  const mh = createHash("sha256").update(material).digest();
  const dh = createHash("sha256").update(devices).digest();
  doc.crypto_material = material.toString("base64");
  doc.device_evidence = devices.toString("base64");
  doc.challenge.nonce = nonce;
  doc.cpu_evidence.endorsed = {
    crypto_material_hash: mh.toString("hex"),
    device_evidence_hash: dh.toString("hex"),
  };
  doc.challenge.report_data =
    createHash("sha256")
      .update(
        Buffer.concat([
          Buffer.from(doc.challenge.report_data_algorithm),
          Buffer.from(nonce, "hex"),
          mh,
          dh,
        ]),
      )
      .digest("hex") + "00".repeat(32);
  return doc;
}

/** Configure the production audit with only caller-owned deadlines and a verified router key.
 * @returns {TinfoilDownstreamOptions} Request ownership and router verification result.
 */
function options(): TinfoilDownstreamOptions {
  return {
    modelId: "model",
    signal: new AbortController().signal,
    limits: DEFAULT_PRIVACY_LIMITS,
    router: {
      configRepo: "tinfoilsh/confidential-model-router",
      codeDigest: "aa".repeat(32),
      codeTag: "v1",
      gpuCount: 0,
      enclaveMeasurement: { type: "sev-snp", launch: "ab".repeat(48) },
      freshnessExpiresAt: new Date(Date.now() + 60000),
      hpkePublicKey: () => routerKey,
    },
  };
}

beforeEach(async () => {
  modes = {};
  calls = [];
  requestContext = null;
  routerKey = await (await Identity.generate()).getPublicKeyHex();
  nodeKey = await (await Identity.generate()).getPublicKeyHex();
  manifest = makeManifest();
  keyPair = await generateKeyPair("ES384", { extractable: true });
  cpu = spyOn(tinfoilVerifier, "verify").mockImplementation(
    async (_bytes, expected) => {
      expect(expected.profile).toBe("model");
      expect(expected.reference).toBe("tinfoilsh/model@v1");
      return {
        configRepo: "tinfoilsh/model",
        codeTag: "v1",
        codeDigest: "ab".repeat(32),
        gpuCount: modes.badCount ? 8 : 4,
        enclaveMeasurement: { type: "sev-snp", launch: "ab".repeat(48) },
        freshnessExpiresAt: new Date(Date.now() + 60000),
        hpkePublicKey: () => nodeKey,
      };
    },
  );
  spyOn(Identity.prototype, "encryptRequestWithContext").mockImplementation(
    async function (this: Identity, r) {
      expect(await r.clone().text()).toBe("{}");
      const encrypted = await originalEncrypt.call(this, r);
      requestContext = encrypted.context;
      return encrypted;
    },
  );
  globalThis.fetch = Object.assign(
    async (
      input: Parameters<typeof fetch>[0],
      init?: Parameters<typeof fetch>[1],
    ) => {
      const r =
        input instanceof Request ? input : new Request(String(input), init);
      calls.push(r.url);
      expect(r.redirect).toBe("error");
      expect(r.headers.has("authorization")).toBe(false);
      const u = new URL(r.url);
      if (u.pathname === "/.well-known/tinfoil-proxy") {
        return encrypted(manifest);
      }
      if (u.pathname === "/.well-known/tinfoil-attestation") {
        expect(u.hostname).toBe(hostname);
        expectedNonce = u.searchParams.get("nonce")!;
        expect(expectedNonce).toMatch(/^[a-f0-9]{64}$/);
        return encrypted(nodeDocument());
      }
      if (
        u.hostname === "nras.attestation.nvidia.com" &&
        u.pathname === "/v4/attest/gpu"
      ) {
        const body = (await r.json()) as {
          nonce: string;
          evidence_list: unknown[];
        };
        expect(body.nonce).toBe(expectedNonce);
        expect(body.evidence_list).toHaveLength(4);
        return Response.json(await tokens());
      }
      if (
        u.hostname === "nras.attestation.nvidia.com" &&
        u.pathname === "/.well-known/jwks.json"
      ) {
        const key = await exportJWK(keyPair.publicKey);
        return Response.json({
          keys: modes.manyKeys
            ? Array.from({ length: 208 }, (_, i) => ({
                ...key,
                kid: i === 207 ? "test" : `historical-${i}`,
              }))
            : [{ ...key, kid: "test" }],
        });
      }
      throw new Error("Unexpected endpoint");
    },
    { preconnect: originalFetch.preconnect },
  );
});
afterEach(() => {
  globalThis.fetch = originalFetch;
  Identity.prototype.encryptRequestWithContext = originalEncrypt;
  cpu.mockRestore();
});

describe("Tinfoil downstream GPU audit", () => {
  it("should authenticate the pool and fresh GPU claims before checking the pool again", async () => {
    const audit = await auditTinfoilDownstream(options());
    await audit.assertCurrentPool();
    expect(audit.report).toEqual({
      scope: "router-admitted-pool",
      identitySource: "client-verified-cpu",
      modelRepository: "tinfoilsh/model",
      enclaveCount: 1,
      gpuCount: 4,
    });
    expect(calls.filter((c) => c.endsWith("tinfoil-proxy"))).toHaveLength(2);
    expect(cpu.mock.calls[0]?.[1]).toMatchObject({
      profile: "model",
      reference: "tinfoilsh/model@v1",
    });
  });
  it("should accept NVIDIA's rotating key set with more than 64 historical keys", async () => {
    modes.manyKeys = true;
    const audit = await auditTinfoilDownstream(options());
    expect(audit.report.gpuCount).toBe(4);
  });
  it.each([
    "plaintext",
    "tampered",
    "wrongNonce",
    "wrongKey",
    "missingGpu",
    "duplicateGpu",
    "gpuFailure",
    "badSignature",
    "expired",
    "unknownVendor",
    "badCount",
  ] as const)("should reject %s evidence", async (mode) => {
    modes[mode] = true;
    await expect(auditTinfoilDownstream(options())).rejects.toBeDefined();
  });
  it("should reject a changed pool before releasing a completion", async () => {
    const audit = await auditTinfoilDownstream(options());
    manifest.models.model.enclaves[hostname]!.hpke_key = "ab".repeat(32);
    await expect(audit.assertCurrentPool()).rejects.toMatchObject({
      code: "PRIVACY_BINDING_UNAVAILABLE",
    });
  });
  it("should reject a failed CPU quote before submitting GPU evidence", async () => {
    cpu.mockRejectedValue(
      Object.assign(new Error("CPU quote invalid"), { layer: "quote" }),
    );
    const diagnostics: {
      operation: string;
      status: string;
      failureReason?: string;
    }[] = [];
    await expect(
      auditTinfoilDownstream({
        ...options(),
        onDiagnostic: (d) => diagnostics.push(d),
      }),
    ).rejects.toMatchObject({ code: "PRIVACY_ATTESTATION_FAILED" });
    expect(calls.some((c) => c.includes("nras.attestation"))).toBe(false);
    expect(
      diagnostics.some(
        (d) =>
          d.operation === "cpu-verification" &&
          d.status === "failed" &&
          d.failureReason === "downstream-cpu-quote-rejected",
      ),
    ).toBe(true);
  });
  it("should reject a different repository or unverified model release", async () => {
    cpu.mockRejectedValue(
      Object.assign(new Error("untrusted signed release"), {
        layer: "provenance",
      }),
    );
    await expect(auditTinfoilDownstream(options())).rejects.toMatchObject({
      code: "PRIVACY_ATTESTATION_FAILED",
    });
    expect(calls.some((c) => c.includes("nras.attestation"))).toBe(false);
  });
  it("should reject expired admissions before contacting an enclave", async () => {
    manifest.models.model.verification.hosts[hostname]!.expires_at = new Date(
      Date.now() - 1000,
    ).toISOString();
    await expect(auditTinfoilDownstream(options())).rejects.toMatchObject({
      code: "PRIVACY_ATTESTATION_FAILED",
    });
    expect(calls).toHaveLength(1);
  });
  it("should reject cancellation before any network access", async () => {
    const c = new AbortController();
    c.abort();
    await expect(
      auditTinfoilDownstream({ ...options(), signal: c.signal }),
    ).rejects.toBeDefined();
    expect(calls).toHaveLength(0);
  });
  it.each([
    "127.0.0.1",
    "localhost",
    "model.tinfoil.containers.tinfoil.dev.evil.test",
    "user@model.tinfoil.containers.tinfoil.dev",
    "model.tinfoil.containers.tinfoil.dev:8443",
  ])("should reject untrusted admission hostname %s", (bad) => {
    const data = makeManifest();
    const selected = data.models.model;
    const invalid = {
      ...data,
      models: {
        model: {
          ...selected,
          enclaves: { [bad]: selected.enclaves[hostname] },
          verification: {
            ...selected.verification,
            hosts: { [bad]: selected.verification.hosts[hostname] },
          },
        },
      },
    };
    expect(() =>
      parseTinfoilAdmittedPool(Buffer.from(JSON.stringify(invalid)), "model"),
    ).toThrow();
  });
});
