import { z } from "zod";
import { parseTinfoilDocument, parseTinfoilReference } from "./owned.document";
import { verifyTinfoilRelease, verifyTinfoilWitness } from "./owned.provenance";
import { authenticateTinfoilAMD, appraiseTinfoilAMD } from "./owned.amd";
import { parseTinfoilJSON, decodeTinfoilBase64 } from "./owned.json";
import { devicesSchema, hex48 } from "./owned.schemas";
import type { TinfoilAppraisal, TinfoilVerification } from "./owned.types";

/** Appraise the supported release-profile V3 protocol with first-party envelope and hardware policy checks.
 * @param {Uint8Array} bytes - Exact bounded endpoint evidence.
 * @param {TinfoilAppraisal} options - Trusted workload policy, request nonce, and one appraisal clock.
 * @returns {Promise<TinfoilVerification>} Immutable authenticated identity and endorsed encryption key.
 */
export async function verifyTinfoilDocument(
  bytes: Uint8Array,
  options: TinfoilAppraisal,
): Promise<TinfoilVerification> {
  let layer = "envelope";
  try {
    if (bytes.length > 2 * 1024 * 1024) {
      throw new Error("Evidence limit exceeded");
    }
    const { document, cpuReport, expectedReportData, hpkeKey } =
      parseTinfoilDocument(bytes, options.nonce);
    const time = options.verificationTime.getTime();
    if (!Number.isFinite(time)) {
      throw new Error("Invalid appraisal time");
    }
    // Device attestation is a separate protocol; the router proof must not imply GPU verification.
    if (
      document.cpu_evidence.format !==
        "https://tinfoil.sh/format/sev-snp-report/v1" ||
      devicesSchema.parse(
        parseTinfoilJSON(decodeTinfoilBase64(document.device_evidence)),
      ).items.length
    ) {
      throw new Error("Unsupported hardware evidence profile");
    }
    const expectedCollateral = [
      ["cpu-endorsement", "endorsement", "amd-vcek"],
      ["cpu-crl", "endorsement", "amd-crl"],
      ["code", "reference-values", "sigstore-code"],
      ["code-freshness", "reference-values", "sigstore-freshness"],
      ["platform", "reference-values", "sigstore-platform"],
      ["platform-freshness", "reference-values", "sigstore-freshness"],
    ] as const;
    if (document.collateral.length !== expectedCollateral.length) {
      throw new Error("Unsupported collateral profile");
    }
    const collateral = new Map(document.collateral.map((c) => [c.id, c]));
    for (const [id, role, format] of expectedCollateral) {
      const c = collateral.get(id);
      if (
        !c ||
        c.role !== role ||
        c.format !== `https://tinfoil.sh/collateral/${format}/v1` ||
        (role === "endorsement"
          ? c.subjects?.length !== 1 || c.subjects[0] !== "cpu"
          : c.subjects !== undefined)
      ) {
        throw new Error("Invalid collateral binding");
      }
    }
    layer = "provenance";
    const reference = parseTinfoilReference(
      options.reference ?? "tinfoilsh/confidential-model-router",
    );
    const code = await verifyTinfoilRelease(
      collateral.get("code")!.data,
      reference,
      time,
    );
    const platform = await verifyTinfoilRelease(
      collateral.get("platform")!.data,
      { repo: "tinfoilsh/cvmimage" },
      time,
      true,
    );
    const age = options.freshnessMaxAgeMs ?? 604800000;
    if (!Number.isSafeInteger(age) || age <= 0 || age > 604800000) {
      throw new Error("Invalid witness age");
    }
    const codeExpiry = await verifyTinfoilWitness(
      collateral.get("code-freshness")!.data,
      code,
      time,
      age,
    );
    const platformExpiry = await verifyTinfoilWitness(
      collateral.get("platform-freshness")!.data,
      platform,
      time,
      age,
    );
    layer = "quote";
    authenticateTinfoilAMD(
      cpuReport,
      collateral.get("cpu-endorsement")!.data,
      collateral.get("cpu-crl")!.data,
      time,
    );
    layer = "policy";
    if (
      code.statement.predicateType !==
        "https://tinfoil.sh/predicate/snp-tdx-multiplatform/v1" ||
      platform.statement.predicateType !==
        "https://tinfoil.sh/predicate/platform-endorsements/v1"
    ) {
      throw new Error("Unsupported signed predicate");
    }
    const workload = z
      .object({
        snp_measurement: hex48,
        vm_shape: z.object({ gpus: z.literal(0) }).passthrough(),
      })
      .passthrough()
      .parse(code.statement.predicate);
    const policies = z
      .object({
        format: z.literal(
          "https://tinfoil.sh/predicate/platform-endorsements/v1",
        ),
        machines: z.record(z.string()),
        policies: z.record(z.unknown()),
      })
      .passthrough()
      .parse(platform.statement.predicate);
    const chipID = Buffer.from(cpuReport.subarray(0x1a0, 0x1e0)).toString(
      "hex",
    );
    const name = policies.machines[chipID];
    if (
      !name ||
      !Object.hasOwn(policies.machines, chipID) ||
      !Object.hasOwn(policies.policies, name)
    ) {
      throw new Error("Unapproved hardware identity");
    }
    const policy = z
      .object({ platform: z.literal("sev-snp"), sev_snp: z.unknown() })
      .strict()
      .parse(policies.policies[name]);
    appraiseTinfoilAMD(
      cpuReport,
      policy.sev_snp,
      workload.snp_measurement,
      expectedReportData,
    );
    const pins = options.pinnedRegisters;
    if (
      pins &&
      (pins.type !== "sev-snp" ||
        (pins.launch && pins.launch !== workload.snp_measurement))
    ) {
      throw new Error("Workload register pin mismatch");
    }
    const expiry = Math.min(codeExpiry, platformExpiry);
    const enclaveMeasurement = Object.freeze({
      type: "sev-snp",
      launch: workload.snp_measurement,
    });
    return Object.freeze({
      configRepo: code.repo,
      codeTag: code.tag,
      codeDigest: code.digest,
      enclaveMeasurement,
      get freshnessExpiresAt() {
        return new Date(expiry);
      },
      platform: Object.freeze({ digest: platform.digest }),
      hpkePublicKey: () => hpkeKey,
    });
  } catch {
    // Keep provider evidence, certificate contents, and library causes out of application logs.
    throw Object.assign(new Error("Tinfoil V3 verification failed"), {
      name: "TinfoilVerificationError",
      layer,
    });
  }
}

/** Provider-owned verification boundary; kept separate from network and encryption orchestration. @internal */
export const tinfoilVerifier = { verify: verifyTinfoilDocument };
