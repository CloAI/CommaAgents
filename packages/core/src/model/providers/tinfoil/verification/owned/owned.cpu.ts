import { z } from "zod";
import { authenticateTinfoilAMD, appraiseTinfoilAMD } from "./owned.amd";
import { authenticateTinfoilIntel, appraiseTinfoilIntel } from "./owned.intel";
import { hex48 } from "./owned.schemas";
import type {
  TinfoilCpuAppraisal,
  TinfoilCpuVerification,
} from "./owned.types";

/** Independently authenticate the CPU and enforce the complete signed platform/workload policy.
 * @param {TinfoilCpuAppraisal} evidence - Nonce-bound evidence and already verified signed reference values.
 * @returns {TinfoilCpuVerification} Authenticated measurements and an authorization expiry.
 */
export function verifyTinfoilCPU(
  evidence: TinfoilCpuAppraisal,
): TinfoilCpuVerification {
  const collateral = new Map(
    evidence.document.collateral.map((c) => [c.id, c]),
  );
  const platform = z
    .object({
      format: z.literal(
        "https://tinfoil.sh/predicate/platform-endorsements/v1",
      ),
      machines: z.record(z.string()),
      policies: z.record(z.unknown()),
      measurements: z.record(z.unknown()).optional(),
    })
    .passthrough()
    .parse(evidence.platform);
  let identity: string;
  let expiresAt: number;
  let intel: ReturnType<typeof authenticateTinfoilIntel> | undefined;
  const amd =
    evidence.document.cpu_evidence.format ===
    "https://tinfoil.sh/format/sev-snp-report/v1";
  try {
    if (amd) {
      expiresAt = authenticateTinfoilAMD(
        evidence.report,
        collateral.get("cpu-endorsement")!.data,
        collateral.get("cpu-crl")!.data,
        evidence.time,
      );
      identity = Buffer.from(evidence.report.subarray(0x1a0, 0x1e0)).toString(
        "hex",
      );
    } else if (
      evidence.document.cpu_evidence.format ===
      "https://tinfoil.sh/format/tdx-quote/v1"
    ) {
      intel = authenticateTinfoilIntel(
        evidence.report,
        collateral.get("cpu-endorsement")!.data,
        evidence.time,
      );
      identity = intel.identity;
      expiresAt = intel.expiresAt;
    } else {
      throw new Error("Unsupported CPU hardware evidence");
    }
  } catch {
    throw Object.assign(new Error("CPU quote authentication failed"), {
      layer: "quote",
    });
  }
  try {
    const name = platform.machines[identity];
    if (
      !name ||
      !Object.hasOwn(platform.machines, identity) ||
      !Object.hasOwn(platform.policies, name)
    ) {
      throw new Error("Unapproved hardware identity");
    }
    if (amd) {
      const policy = z
        .object({ platform: z.literal("sev-snp"), sev_snp: z.unknown() })
        .strict()
        .parse(platform.policies[name]);
      const launch = hex48.parse(evidence.workload.snp_measurement);
      appraiseTinfoilAMD(
        evidence.report,
        policy.sev_snp,
        launch,
        evidence.reportData,
      );
      return {
        measurements: Object.freeze({ type: "sev-snp", launch }),
        expiresAt,
      };
    }
    const policy = z
      .object({ platform: z.literal("tdx"), tdx: z.unknown() })
      .strict()
      .parse(platform.policies[name]);
    appraiseTinfoilIntel(
      intel!,
      policy.tdx,
      platform.measurements ?? {},
      evidence.workload,
      evidence.reportData,
    );
    const r = intel!.report;
    return {
      measurements: Object.freeze({
        type: "tdx",
        mrtd: Buffer.from(r.mrTd).toString("hex"),
        rtmr0: Buffer.from(r.rtMr0).toString("hex"),
        rtmr1: Buffer.from(r.rtMr1).toString("hex"),
        rtmr2: Buffer.from(r.rtMr2).toString("hex"),
        rtmr3: Buffer.from(r.rtMr3).toString("hex"),
      }),
      expiresAt,
    };
  } catch {
    throw Object.assign(new Error("CPU workload policy rejected"), {
      layer: "policy",
    });
  }
}
