import { describe, expect, it } from "bun:test";
import { createHash } from "node:crypto";
import { verifyTinfoilDocument } from "./owned/owned";
import fixture from "./production-v3.fixture.json";
import { validateTinfoilPolicy } from "./verification";

const documentBytes = Buffer.from(fixture.documentBase64, "base64");
const nonce = Buffer.from(fixture.nonceHex, "hex");
const capturedAt = new Date(fixture.capturedAt);

function verifyDocumentV3At(
  bytes: Uint8Array,
  nonce: Uint8Array,
  reference: string,
  verificationTime: Date,
) {
  return verifyTinfoilDocument(bytes, { nonce, reference, verificationTime });
}

describe("first-party Tinfoil V3 verifier", () => {
  it("should authenticate a captured production quote, provenance, policy, nonce and transport keys", async () => {
    const verified = await verifyDocumentV3At(
      documentBytes,
      nonce,
      fixture.identity,
      capturedAt,
    );
    expect(verified.configRepo).toBe("tinfoilsh/confidential-model-router");
    expect(verified.codeDigest).toMatch(/^[a-f0-9]{64}$/);
    expect(verified.enclaveMeasurement.type).toBe("sev-snp");
    expect(verified.hpkePublicKey()).toMatch(/^[a-f0-9]{64}$/);
    expect(verified.freshnessExpiresAt!.getTime()).toBeGreaterThan(
      capturedAt.getTime(),
    );
    expect(Object.isFrozen(verified)).toBe(true);
  });
  it("should reject a nonce from a different request", async () => {
    await expect(
      verifyDocumentV3At(
        documentBytes,
        Buffer.alloc(32),
        fixture.identity,
        capturedAt,
      ),
    ).rejects.toMatchObject({ layer: "envelope" });
  });
  it("should reject expired freshness witnesses even when all document bytes are authentic", async () => {
    const verified = await verifyDocumentV3At(
      documentBytes,
      nonce,
      fixture.identity,
      capturedAt,
    );
    await expect(
      verifyDocumentV3At(
        documentBytes,
        nonce,
        fixture.identity,
        new Date(verified.freshnessExpiresAt!.getTime() + 1),
      ),
    ).rejects.toBeDefined();
  });
  it("should reject an unapproved release digest and additional register pin", async () => {
    await expect(
      verifyDocumentV3At(
        documentBytes,
        nonce,
        `${fixture.identity}@sha256:${"00".repeat(32)}`,
        capturedAt,
      ),
    ).rejects.toBeDefined();
    await expect(
      verifyTinfoilDocument(documentBytes, {
        nonce,
        reference: fixture.identity,
        verificationTime: capturedAt,
        pinnedRegisters: { type: "sev-snp", launch: "00".repeat(48) },
      }),
    ).rejects.toMatchObject({ layer: "policy" });
  });
  it("should reject modified endorsed key bytes even after an attacker recomputes envelope hashes", async () => {
    const document = JSON.parse(documentBytes.toString()) as {
      crypto_material: string;
      challenge: {
        nonce: string;
        report_data: string;
        report_data_algorithm: string;
      };
      cpu_evidence: {
        endorsed: {
          crypto_material_hash: string;
          device_evidence_hash: string;
        };
      };
    };
    const material = JSON.parse(
      Buffer.from(document.crypto_material, "base64").toString(),
    ) as { items: { id: string; data: string }[] };
    const key = material.items.find((entry) => entry.id === "hpke")!;
    key.data = "11".repeat(32);
    const replaced = Buffer.from(JSON.stringify(material));
    document.crypto_material = replaced.toString("base64");
    document.cpu_evidence.endorsed.crypto_material_hash = createHash("sha256")
      .update(replaced)
      .digest("hex");
    document.challenge.report_data =
      createHash("sha256")
        .update(
          Buffer.concat([
            Buffer.from(document.challenge.report_data_algorithm),
            nonce,
            Buffer.from(
              document.cpu_evidence.endorsed.crypto_material_hash,
              "hex",
            ),
            Buffer.from(
              document.cpu_evidence.endorsed.device_evidence_hash,
              "hex",
            ),
          ]),
        )
        .digest("hex") + "00".repeat(32);
    await expect(
      verifyDocumentV3At(
        Buffer.from(JSON.stringify(document)),
        nonce,
        fixture.identity,
        capturedAt,
      ),
    ).rejects.toMatchObject({ layer: "policy" });
  });
  it("should never accept legacy V2 evidence as V3", async () => {
    await expect(
      verifyDocumentV3At(
        Buffer.from(
          '{"format":"https://tinfoil.sh/predicate/sev-snp-guest/v2","body":""}',
        ),
        nonce,
        fixture.identity,
        capturedAt,
      ),
    ).rejects.toMatchObject({ layer: "envelope" });
  });
  it.each([
    { reference: "" },
    { reference: null },
    { apiKey: "override" },
    { freshnessMaxAgeMs: 0 },
    { freshnessMaxAgeMs: null },
    { freshnessMaxAgeMs: 604800001 },
    { pinnedRegisters: null },
    { pinnedRegisters: { type: "tdx", rtmr0: "invalid" } },
  ])("should reject invalid or overbroad verification policy %j", (options) => {
    expect(() =>
      validateTinfoilPolicy(
        options as Parameters<typeof validateTinfoilPolicy>[0],
      ),
    ).toThrow("Invalid protection configuration");
  });
});
