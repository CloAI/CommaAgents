import { describe, expect, it, spyOn } from "bun:test";
import { createHash } from "node:crypto";
import turin from "./turin-model.fixture.json";
import intel from "./tdx-model.fixture.json";
import { verifyTinfoilDocument } from "./owned";
import { parseTinfoilDocument } from "./owned.document";
import {
  parseTinfoilJSON,
  decodeTinfoilBase64,
  readTinfoilSignedJSONObject,
} from "./owned.json";
import { documentSchema } from "./owned.schemas";
import { authenticateTinfoilIntel, appraiseTinfoilIntel } from "./owned.intel";
import { authenticateTinfoilAMD, appraiseTinfoilAMD } from "./owned.amd";
import { verifyTinfoilCPU } from "./owned.cpu";
import roots from "./roots/amd.json";
import provenance from "./roots/provenance.json";
import type { TinfoilCpuAppraisal } from "./owned.types";

/** Decode archived public evidence with its independently recorded capture time.
 * @param {typeof turin} fixture - Public nonce-bound evidence fixture.
 * @returns {object} Validated envelope and trusted test expectations.
 */
function evidence(fixture: typeof turin) {
  const bytes = Buffer.from(fixture.documentBase64, "base64");
  const nonce = Buffer.from(fixture.nonceHex, "hex");
  const parsed = parseTinfoilDocument(bytes, nonce);
  const predicates = new Map(
    parsed.document.collateral
      .filter((c) => ["code", "platform"].includes(c.id))
      .map((c) => [
        c.id,
        (
          parseTinfoilJSON(
            decodeTinfoilBase64(
              (c.data.sigstore_bundle as { dsseEnvelope: { payload: string } })
                .dsseEnvelope.payload,
            ),
          ) as { predicate: Record<string, unknown> }
        ).predicate,
      ]),
  );
  const appraisal: TinfoilCpuAppraisal = {
    document: parsed.document,
    report: parsed.cpuReport,
    reportData: parsed.expectedReportData,
    platform: predicates.get("platform")!,
    workload: predicates.get("code")!,
    time: Date.parse(fixture.capturedAt),
  };
  return {
    ...parsed,
    bytes,
    nonce,
    appraisal,
    options: {
      nonce,
      reference: fixture.identity,
      verificationTime: new Date(fixture.capturedAt),
      profile: "model" as const,
    },
  };
}

/** Rehash endorsed sections as an attacker could, without access to the CPU report signing key.
 * @param {ReturnType<typeof documentSchema.parse>} document - Mutated public fixture.
 * @returns {Uint8Array} Recomputed envelope with its original hardware signature.
 */
function recomputeEnvelope(
  document: ReturnType<typeof documentSchema.parse>,
): Uint8Array {
  const material = createHash("sha256")
    .update(Buffer.from(document.crypto_material, "base64"))
    .digest();
  const devices = createHash("sha256")
    .update(Buffer.from(document.device_evidence, "base64"))
    .digest();
  document.cpu_evidence.endorsed = {
    crypto_material_hash: material.toString("hex"),
    device_evidence_hash: devices.toString("hex"),
  };
  document.challenge.report_data =
    createHash("sha256")
      .update(
        Buffer.concat([
          Buffer.from(document.challenge.report_data_algorithm),
          Buffer.from(document.challenge.nonce, "hex"),
          material,
          devices,
        ]),
      )
      .digest("hex") + "00".repeat(32);
  return Buffer.from(JSON.stringify(document));
}

for (const [name, fixture, platform, gpuCount] of [
  ["AMD Turin", turin, "sev-snp", 8],
  ["Intel TDX", intel, "tdx", 4],
] as const) {
  describe(`independent ${name} model CPU verification`, () => {
    const f = evidence(fixture);
    it("should verify manufacturer signatures, revocation, policy, software, nonce, keys and GPU evidence offline", async () => {
      const network = spyOn(globalThis, "fetch").mockRejectedValue(
        new Error("CPU verification must remain offline"),
      );
      try {
        const verified = await verifyTinfoilDocument(f.bytes, f.options);
        expect(verified.enclaveMeasurement.type).toBe(platform);
        expect(verified.gpuCount).toBe(gpuCount);
        expect(verified.hpkePublicKey()).toBe(f.hpkeKey);
        expect(verified.freshnessExpiresAt.getTime()).toBeGreaterThan(
          f.appraisal.time,
        );
        expect(network).not.toHaveBeenCalled();
      } finally {
        network.mockRestore();
      }
    });
    it("should reject another request's nonce", async () => {
      await expect(
        verifyTinfoilDocument(f.bytes, {
          ...f.options,
          nonce: Buffer.alloc(32),
        }),
      ).rejects.toMatchObject({ layer: "envelope" });
    });
    it("should reject an unapproved model repository", async () => {
      await expect(
        verifyTinfoilDocument(f.bytes, {
          ...f.options,
          reference: "tinfoilsh/unapproved-model",
        }),
      ).rejects.toMatchObject({ layer: "provenance" });
    });
    it.each([0, 8, 64, platform === "tdx" ? 636 : 0x2a0])(
      "should reject modified quote bytes at offset %i",
      async (offset) => {
        const d = structuredClone(f.document);
        const report = Buffer.from(d.cpu_evidence.report_base64, "base64");
        report[offset]! ^= 1;
        d.cpu_evidence.report_base64 = report.toString("base64");
        await expect(
          verifyTinfoilDocument(Buffer.from(JSON.stringify(d)), f.options),
        ).rejects.toMatchObject({ layer: "quote" });
      },
    );
    it("should reject a replacement encryption key even after all unsigned envelope hashes are recomputed", async () => {
      const d = structuredClone(f.document);
      const m = JSON.parse(
        Buffer.from(d.crypto_material, "base64").toString(),
      ) as { items: { id: string; data: string }[] };
      m.items.find((i) => i.id === "hpke")!.data = "11".repeat(32);
      d.crypto_material = Buffer.from(JSON.stringify(m)).toString("base64");
      await expect(
        verifyTinfoilDocument(recomputeEnvelope(d), f.options),
      ).rejects.toMatchObject({ layer: "policy" });
    });
    it("should reject replacement GPU evidence even when its envelope hash is updated", async () => {
      const d = structuredClone(f.document);
      const devices = JSON.parse(
        Buffer.from(d.device_evidence, "base64").toString(),
      ) as { items: { evidence: { evidence: string } }[] };
      devices.items[0]!.evidence.evidence = "forged GPU evidence";
      d.device_evidence = Buffer.from(JSON.stringify(devices)).toString(
        "base64",
      );
      await expect(
        verifyTinfoilDocument(recomputeEnvelope(d), f.options),
      ).rejects.toMatchObject({ layer: "policy" });
    });
    it("should reject a valid CPU that has no signed machine approval", () => {
      expect(() =>
        verifyTinfoilCPU({
          ...f.appraisal,
          platform: { ...f.appraisal.platform, machines: {} },
        }),
      ).toThrow();
    });
    it("should reject missing CPU collateral without trusting the admitted key", async () => {
      const d = structuredClone(f.document);
      d.collateral = d.collateral.filter((c) => c.id !== "cpu-endorsement");
      await expect(
        verifyTinfoilDocument(Buffer.from(JSON.stringify(d)), f.options),
      ).rejects.toMatchObject({ layer: "envelope" });
    });
    it("should enforce additional workload register pins", async () => {
      await expect(
        verifyTinfoilDocument(f.bytes, {
          ...f.options,
          pinnedRegisters:
            platform === "tdx"
              ? { type: "tdx", rtmr1: "00".repeat(48) }
              : { type: "sev-snp", launch: "00".repeat(48) },
        }),
      ).rejects.toMatchObject({ layer: "policy" });
    });
  });
}

describe("AMD Turin hardware and policy", () => {
  const f = evidence(turin);
  const c = f.document.collateral.find((c) => c.id === "cpu-endorsement")!.data;
  const crl = f.document.collateral.find((c) => c.id === "cpu-crl")!.data;
  const key = Buffer.from(f.cpuReport.subarray(0x1a0, 0x1e0)).toString("hex");
  const platform = f.appraisal.platform as {
    machines: Record<string, string>;
    policies: Record<string, { sev_snp: Record<string, unknown> }>;
  };
  const policy = platform.policies[platform.machines[key]!]!.sev_snp;
  it("should retain an independently sourced Turin manufacturer chain", () =>
    expect(createHash("sha256").update(roots.turinChainPem).digest("hex")).toBe(
      provenance.amdTurin.sha256,
    ));
  it("should reject a Genoa certificate chain for a Turin report", () => {
    expect(() =>
      authenticateTinfoilAMD(
        f.cpuReport,
        { ...c, cert_chain_pem: roots.genoaChainPem },
        crl,
        f.appraisal.time,
      ),
    ).toThrow();
  });
  it.each([0x180, 0x184, 0x188, 0x1a0, 0x1a8, 0x2a0])(
    "should reject modified hardware identity, FMC or signature at offset %i",
    (offset) => {
      const report = Buffer.from(f.cpuReport);
      report[offset]! ^= 1;
      expect(() =>
        authenticateTinfoilAMD(report, c, crl, f.appraisal.time),
      ).toThrow();
    },
  );
  it("should enforce Turin FMC and IOMMU policy requirements", () => {
    for (const changed of [
      {
        ...policy,
        minimum_tcb: { ...(policy.minimum_tcb as object), fmc_spl: 255 },
      },
      {
        ...policy,
        platform_info: {
          ...(policy.platform_info as object),
          iommu_write_safe: false,
        },
      },
    ]) {
      expect(() =>
        appraiseTinfoilAMD(
          f.cpuReport,
          changed,
          f.appraisal.workload.snp_measurement as string,
          f.expectedReportData,
        ),
      ).toThrow();
    }
  });
  it("should compare mitigation vectors as required bits rather than a numeric floor", () => {
    const report = Buffer.from(f.cpuReport);
    report.writeBigUInt64LE(2n, 0x1f8);
    expect(() =>
      appraiseTinfoilAMD(
        report,
        { ...policy, minimum_launch_mitigation_vector: 1n },
        f.appraisal.workload.snp_measurement as string,
        f.expectedReportData,
      ),
    ).toThrow();
  });
});

describe("Intel TDX hardware and policy", () => {
  const f = evidence(intel);
  const collateral = f.document.collateral.find(
    (c) => c.id === "cpu-endorsement",
  )!.data;
  const authenticated = authenticateTinfoilIntel(
    f.cpuReport,
    collateral,
    f.appraisal.time,
  );
  const platform = f.appraisal.platform as {
    machines: Record<string, string>;
    policies: Record<string, { tdx: Record<string, unknown> }>;
    measurements: Record<string, unknown>;
  };
  const policy =
    platform.policies[platform.machines[authenticated.identity]!]!.tdx;
  it("should authenticate PPID from the verified PCK certificate", () =>
    expect(authenticated.identity).toMatch(/^[0-9a-f]{32}$/));
  it.each([
    "qe_vendor_id",
    "minimum_tee_tcb_svn",
    "mr_seam",
    "td_attributes",
    "xfam",
  ])("should enforce signed %s policy", (field) => {
    const current = policy[field] as string;
    const changed = { ...policy, [field]: "ff".repeat(current.length / 2) };
    expect(() =>
      appraiseTinfoilIntel(
        authenticated,
        changed,
        platform.measurements,
        f.appraisal.workload,
        f.expectedReportData,
      ),
    ).toThrow();
  });
  it("should enforce collateral evaluation version and measured VM shape", () => {
    expect(() =>
      appraiseTinfoilIntel(
        authenticated,
        {
          ...policy,
          minimum_tcb_evaluation_data_number:
            authenticated.tcbEvaluationDataNumber + 1,
        },
        platform.measurements,
        f.appraisal.workload,
        f.expectedReportData,
      ),
    ).toThrow();
    expect(() =>
      appraiseTinfoilIntel(
        authenticated,
        policy,
        platform.measurements,
        {
          ...f.appraisal.workload,
          vm_shape: { ...(f.appraisal.workload.vm_shape as object), cpus: 999 },
        },
        f.expectedReportData,
      ),
    ).toThrow();
  });
  it.each(["mrConfigId", "mrOwner", "mrOwnerConfig", "rtMr3"] as const)(
    "should reject unapproved %s state",
    (field) => {
      const changed = {
        ...authenticated,
        report: {
          ...authenticated.report,
          [field]: new Uint8Array(48).fill(1),
        },
      };
      expect(() =>
        appraiseTinfoilIntel(
          changed,
          policy,
          platform.measurements,
          f.appraisal.workload,
          f.expectedReportData,
        ),
      ).toThrow();
    },
  );
  it("should reject unsigned nonzero quote padding", () => {
    expect(() =>
      authenticateTinfoilIntel(
        Buffer.concat([Buffer.from(f.cpuReport), Buffer.from([1])]),
        collateral,
        f.appraisal.time,
      ),
    ).toThrow();
  });
  it("should reject collateral substitution despite provider verification headers", () => {
    const changed = structuredClone(collateral) as {
      responses: {
        url: string;
        headers: Record<string, string[]>;
        body_base64: string;
      }[];
    };
    const crl = changed.responses.find((r) => r.url.includes("pckcrl"))!;
    const bytes = Buffer.from(crl.body_base64, "base64");
    bytes[bytes.length - 1]! ^= 1;
    crl.body_base64 = bytes.toString("base64");
    crl.headers["X-Collateral-Verified"] = ["true"];
    expect(() =>
      authenticateTinfoilIntel(f.cpuReport, changed, f.appraisal.time),
    ).toThrow();
  });
  it("should reject ambiguous and non-Intel collateral resource identities", () => {
    const changed = structuredClone(collateral) as {
      responses: { url: string }[];
    };
    changed.responses[0]!.url =
      "https://evil.invalid/sgx/certification/v4/pckcrl?ca=platform&encoding=der";
    expect(() =>
      authenticateTinfoilIntel(f.cpuReport, changed, f.appraisal.time),
    ).toThrow();
  });
  it("should preserve the exact signed JSON object encoding", () => {
    const raw = Buffer.from(
      '{"signature":"test","tcbInfo": { "version": 3,\n"issueDate": "2026-01-01T00:00:00Z" }}',
    );
    expect(readTinfoilSignedJSONObject(raw, "tcbInfo")).toBe(
      '{ "version": 3,\n"issueDate": "2026-01-01T00:00:00Z" }',
    );
    expect(() =>
      readTinfoilSignedJSONObject(
        Buffer.from('{"tcbInfo":{},"tcbInfo":{}}'),
        "tcbInfo",
      ),
    ).toThrow();
  });
});
