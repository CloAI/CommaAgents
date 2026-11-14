import { describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import { z } from "zod";
import fixture from "../production-v3.fixture.json";
import { verifyTinfoilDocument } from "./owned";
import { parseTinfoilDocument, parseTinfoilReference } from "./owned.document";
import { authenticateTinfoilAMD, appraiseTinfoilAMD } from "./owned.amd";
import { parseTinfoilJSON, decodeTinfoilBase64 } from "./owned.json";
import { parseTinfoilDER } from "./owned.der";
import { documentSchema } from "./owned.schemas";
import roots from "./roots/sigstore.json";
import manufacturer from "./roots/amd.json";
import provenance from "./roots/provenance.json";

const bytes = Buffer.from(fixture.documentBase64, "base64");
const nonce = Buffer.from(fixture.nonceHex, "hex");
const time = new Date(fixture.capturedAt);
const evidence = parseTinfoilDocument(bytes, nonce);
const document = evidence.document;
const endorsements = document.collateral.find(
  (c) => c.id === "cpu-endorsement",
)!.data;
const crl = document.collateral.find((c) => c.id === "cpu-crl")!.data;
const platformBundle = z
  .object({ dsseEnvelope: z.object({ payload: z.string() }) })
  .parse(
    document.collateral.find((c) => c.id === "platform")!.data.sigstore_bundle,
  );
const platform = z
  .object({
    predicate: z.object({
      machines: z.record(z.string()),
      policies: z.record(
        z.object({ sev_snp: z.record(z.unknown()).optional() }).passthrough(),
      ),
    }),
  })
  .parse(
    parseTinfoilJSON(decodeTinfoilBase64(platformBundle.dsseEnvelope.payload)),
  );
const chip = Buffer.from(evidence.cpuReport.subarray(0x1a0, 0x1e0)).toString(
  "hex",
);
const policy =
  platform.predicate.policies[platform.predicate.machines[chip]!]!.sev_snp!;
const launch = Buffer.from(evidence.cpuReport.subarray(0x90, 0xc0)).toString(
  "hex",
);

/** Appraise a mutated public fixture without sending any inference data.
 * @param {unknown} document - Attestation fixture or mutation.
 * @returns {Promise<unknown>} First-party appraisal result.
 */
function appraise(document: unknown) {
  return verifyTinfoilDocument(Buffer.from(JSON.stringify(document)), {
    nonce,
    verificationTime: time,
    reference: fixture.identity,
  });
}

/** Modify one public collateral bundle without changing the source fixture.
 * @param {string} id - Collateral identifier.
 * @param {Function} mutate - Untrusted bundle modification.
 * @returns {object} Mutated attestation document.
 */
function changeBundle(
  id: string,
  mutate: (bundle: {
    dsseEnvelope: { payload: string; signatures: { sig: string }[] };
    verificationMaterial: {
      tlogEntries: {
        integratedTime: string;
        canonicalizedBody: string;
        inclusionProof: { checkpoint: { envelope: string } };
      }[];
    };
  }) => void,
) {
  const copy = documentSchema.parse(JSON.parse(JSON.stringify(document)));
  const bundle = copy.collateral.find((c) => c.id === id)!.data
    .sigstore_bundle as Parameters<typeof mutate>[0];
  mutate(bundle);
  return copy;
}

describe("first-party V3 trust boundaries", () => {
  it("should authenticate manufacturer roots obtained independently from the PR", () => {
    expect(
      createHash("sha256").update(manufacturer.genoaChainPem).digest("hex"),
    ).toBe(provenance.amdGenoa.sha256);
    expect(
      createHash("sha256")
        .update(`${JSON.stringify(roots, null, 2)}\n`)
        .digest("hex"),
    ).toBe(provenance.sigstore.sha256);
  });
  it.each(["code", "code-freshness", "platform", "platform-freshness"])(
    "should reject modified signed payloads in %s",
    async (id) => {
      const copy = changeBundle(id, (b) => {
        b.dsseEnvelope.payload =
          Buffer.from('{"_type":"forged"}').toString("base64");
      });
      await expect(appraise(copy)).rejects.toMatchObject({
        layer: "provenance",
      });
    },
  );
  it.each(["code", "code-freshness", "platform", "platform-freshness"])(
    "should reject modified signatures in %s",
    async (id) => {
      const copy = changeBundle(id, (b) => {
        b.dsseEnvelope.signatures[0]!.sig = Buffer.alloc(72).toString("base64");
      });
      await expect(appraise(copy)).rejects.toMatchObject({
        layer: "provenance",
      });
    },
  );
  it("should reject invented freshness log timestamps", async () => {
    const copy = changeBundle("code-freshness", (b) => {
      b.verificationMaterial.tlogEntries[0]!.integratedTime = String(
        Math.floor(time.getTime() / 1000),
      );
    });
    await expect(appraise(copy)).rejects.toMatchObject({ layer: "provenance" });
  });
  it("should reject modified transparency checkpoints", async () => {
    const copy = changeBundle("platform", (b) => {
      b.verificationMaterial.tlogEntries[0]!.inclusionProof.checkpoint.envelope =
        "forged checkpoint";
    });
    await expect(appraise(copy)).rejects.toMatchObject({ layer: "provenance" });
  });
  it("should reject collateral substitution and missing revocation evidence", async () => {
    const copy = structuredClone(document);
    copy.collateral = copy.collateral.filter((c) => c.id !== "cpu-crl");
    await expect(appraise(copy)).rejects.toMatchObject({ layer: "envelope" });
    const wrong = structuredClone(document);
    wrong.collateral.find((c) => c.id === "cpu-crl")!.subjects = ["hpke"];
    await expect(appraise(wrong)).rejects.toMatchObject({ layer: "envelope" });
  });
  it("should reject unsupported TDX and registry collateral rather than claim partial verification", async () => {
    const copy = structuredClone(document);
    copy.cpu_evidence.format = "https://tinfoil.sh/format/tdx-quote/v1";
    await expect(appraise(copy)).rejects.toMatchObject({ layer: "envelope" });
    await expect(
      appraise({
        ...document,
        collateral_format:
          "https://tinfoil.sh/predicate/attestation-collaterals/v3",
      }),
    ).rejects.toMatchObject({ layer: "envelope" });
  });
  it.each([
    0, 4, 8, 0x30, 0x34, 0x38, 0x40, 0x48, 0x50, 0x90, 0xc0, 0xe0, 0x110, 0x140,
    0x180, 0x188, 0x1a0, 0x1e0, 0x1e8, 0x1f0, 0x1f8, 0x200, 0x2a0, 0x2e8,
  ])("should reject altered CPU report bytes at offset %i", (offset) => {
    const changed = Buffer.from(evidence.cpuReport);
    changed[offset]! ^= 1;
    expect(() =>
      authenticateTinfoilAMD(changed, endorsements, crl, time.getTime()),
    ).toThrow();
  });
  it("should reject expired or modified manufacturer collateral", () => {
    expect(() =>
      authenticateTinfoilAMD(
        evidence.cpuReport,
        endorsements,
        crl,
        Date.parse("2100-01-01"),
      ),
    ).toThrow();
    const certificate = Buffer.from(
      endorsements.vcek_der_base64 as string,
      "base64",
    );
    certificate[certificate.length - 1]! ^= 1;
    expect(() =>
      authenticateTinfoilAMD(
        evidence.cpuReport,
        { ...endorsements, vcek_der_base64: certificate.toString("base64") },
        crl,
        time.getTime(),
      ),
    ).toThrow();
    const revoked = Buffer.from(crl.crl_der_base64 as string, "base64");
    revoked[revoked.length - 1]! ^= 1;
    expect(() =>
      authenticateTinfoilAMD(
        evidence.cpuReport,
        endorsements,
        { crl_der_base64: revoked.toString("base64") },
        time.getTime(),
      ),
    ).toThrow();
  });
  it.each([
    4, 8, 0x10, 0x20, 0x30, 0x38, 0x40, 0x50, 0x90, 0xc0, 0xe0, 0x110, 0x180,
    0x1e0, 0x1e8, 0x1ec, 0x1f0,
  ])(
    "should separately enforce signed hardware policy at offset %i",
    (offset) => {
      const changed = Buffer.from(evidence.cpuReport);
      if (offset === 4) {
        changed.writeUInt32LE(0xffffffff, offset);
      } else if ([0x38, 0x180, 0x1e0, 0x1f0].includes(offset)) {
        changed.fill(0, offset, offset + 8);
      } else if (offset === 8) {
        changed[10]! ^= 8;
      } else {
        changed[offset]! ^= 1;
      }
      if (offset === 4) {
        const stronger = { ...policy, minimum_guest_svn: 0xffffffff };
        changed.writeUInt32LE(0, offset);
        expect(() =>
          appraiseTinfoilAMD(
            changed,
            stronger,
            launch,
            evidence.expectedReportData,
          ),
        ).toThrow();
      } else {
        expect(() =>
          appraiseTinfoilAMD(
            changed,
            policy,
            launch,
            evidence.expectedReportData,
          ),
        ).toThrow();
      }
    },
  );
  it("should refuse debug, migration, provisional firmware and unknown policy semantics", () => {
    for (const changed of [
      {
        ...policy,
        guest_policy: { ...(policy.guest_policy as object), debug: true },
      },
      {
        ...policy,
        guest_policy: { ...(policy.guest_policy as object), migrate_ma: true },
      },
      { ...policy, permit_provisional_firmware: true },
      { ...policy, unhandled_security_requirement: true },
      { ...policy, minimum_launch_mitigation_vector: 1n },
      { ...policy, minimum_current_mitigation_vector: 1n },
    ]) {
      expect(() =>
        appraiseTinfoilAMD(
          evidence.cpuReport,
          changed,
          launch,
          evidence.expectedReportData,
        ),
      ).toThrow();
    }
  });
  it("should not expose mutable freshness or measurements after verification", async () => {
    const result = (await appraise(document)) as Awaited<
      ReturnType<typeof verifyTinfoilDocument>
    >;
    const expiry = result.freshnessExpiresAt.getTime();
    result.freshnessExpiresAt.setTime(0);
    expect(result.freshnessExpiresAt.getTime()).toBe(expiry);
    expect(Object.isFrozen(result.enclaveMeasurement)).toBe(true);
  });
});

describe("strict attestation encodings", () => {
  it.each([
    '{"a":1,"a":2}',
    '{"a":1,"\\u0061":2}',
    '{"__proto__":{}}',
    '{"x":1,}',
    "[1,]",
    "01",
    "NaN",
    "1e999",
    '"\\ud800"',
    '"\\udfff"',
    "true false",
    "\ufeff{}",
  ])("should reject ambiguous JSON %j", (source) => {
    expect(() => parseTinfoilJSON(Buffer.from(source))).toThrow();
  });
  it("should preserve exact 64-bit mitigation vectors", () => {
    expect(
      parseTinfoilJSON(Buffer.from('{"minimum":18446744073709551615}')),
    ).toEqual({ minimum: 18446744073709551615n });
    expect(parseTinfoilJSON(Buffer.from('"\\ud83d\\ude00"'))).toBe("😀");
  });
  it.each(["AA", "AB==", "AA==\n", "AA-_", "AAAA="])(
    "should reject noncanonical base64 %s",
    (s) => expect(() => decodeTinfoilBase64(s)).toThrow(),
  );
  it.each([
    "30800000",
    "02020001",
    "010101",
    "03020801",
    "300102",
    "050100",
    "0000",
    "04810100",
  ])("should reject invalid DER %s", (s) =>
    expect(() => parseTinfoilDER(Buffer.from(s, "hex"))).toThrow(),
  );
  it("should reject excessive nesting and sizes", () => {
    expect(() =>
      parseTinfoilJSON(Buffer.from(`${"[".repeat(66)}0${"]".repeat(66)}`)),
    ).toThrow();
    expect(() => parseTinfoilDER(new Uint8Array(1024 * 1024 + 1))).toThrow();
  });
  it("should retain independent release and digest constraints", () => {
    expect(
      parseTinfoilReference(
        `tinfoilsh/confidential-model-router@v0.0.169@sha256:${"ab".repeat(32)}`,
      ),
    ).toEqual({
      repo: "tinfoilsh/confidential-model-router",
      tag: "v0.0.169",
      digest: "ab".repeat(32),
    });
  });
});
