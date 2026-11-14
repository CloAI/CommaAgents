import { createHash } from "node:crypto";
import type { TDReport10 } from "@phala/dcap-qvl";
import { privacyError } from "../../../../privacy/privacy.utils";
import type { PrivacyWorkloadMismatch } from "../../../../privacy/privacy.types";
import type {
  VeniceWorkloadMeasurements,
  VeniceWorkloadPolicy,
} from "../../venice.types";
import type { HardwareEvidence } from "../verification.types";
import { equalBytes } from "../verification.utils";
import { ComposeManagerSchema } from "./measurements.schemas";
import {
  canonicalMeasurementJSON,
  replayRuntimeMeasurements,
} from "./measurements.utils";
import type { ComposeManagerEvidence } from "./measurements.types";

/** Authenticate the software log and manifest against an independently verified CPU report.
 * @param {HardwareEvidence["workload"]} workload - Raw software evidence, never trusted reference values.
 * @param {TDReport10} report - CPU report returned by successful DCAP verification.
 * @returns {VeniceWorkloadMeasurements} Hardware-bound software measurements, not approval.
 */
export function verifyWorkloadMeasurements(
  workload: HardwareEvidence["workload"],
  report: TDReport10,
): VeniceWorkloadMeasurements {
  if (!workload || typeof workload.appCompose !== "string") {
    throw privacyError("PRIVACY_MEASUREMENTS_UNAVAILABLE");
  }
  const { events, digest } = replayRuntimeMeasurements(workload.eventLog);
  if (!equalBytes(digest, report.rtMr3)) {
    throw privacyError("PRIVACY_MEASUREMENTS_INVALID");
  }
  const ready = events.findIndex((event) => event.event === "system-ready");
  if (
    ready < 0 ||
    events.filter((event) => event.event === "system-ready").length !== 1
  ) {
    throw privacyError("PRIVACY_MEASUREMENTS_INVALID");
  }
  const appEvents = events.filter((event) => event.event === "app-id");
  const keyProviderEvents = events.filter(
    (event) => event.event === "key-provider",
  );
  if (
    appEvents.length !== 1 ||
    keyProviderEvents.length !== 1 ||
    events.indexOf(appEvents[0]!) >= ready ||
    events.indexOf(keyProviderEvents[0]!) >= ready ||
    ![40, 64].includes(appEvents[0]!.event_payload.length) ||
    !keyProviderEvents[0]!.event_payload.length
  ) {
    throw privacyError("PRIVACY_MEASUREMENTS_INVALID");
  }
  const composeEvents = events.filter(
    (event) => event.event === "compose-hash",
  );
  const osEvents = events.filter((event) => event.event === "os-image-hash");
  if (
    composeEvents.length !== 1 ||
    osEvents.length !== 1 ||
    events.indexOf(composeEvents[0]!) >= ready ||
    events.indexOf(osEvents[0]!) >= ready
  ) {
    throw privacyError("PRIVACY_MEASUREMENTS_INVALID");
  }
  const composeHash = createHash("sha256")
    .update(workload.appCompose)
    .digest("hex");
  const osImageHash = osEvents[0]!.event_payload.toLowerCase();
  const expectedConfig = Buffer.alloc(48);
  expectedConfig[0] = 1;
  Buffer.from(composeHash, "hex").copy(expectedConfig, 1);
  if (
    composeEvents[0]!.event_payload.toLowerCase() !== composeHash ||
    osImageHash.length !== 64 ||
    !equalBytes(expectedConfig, report.mrConfigId)
  ) {
    throw privacyError("PRIVACY_MEASUREMENTS_INVALID");
  }
  return {
    mrTd: Buffer.from(report.mrTd).toString("hex"),
    rtMr0: Buffer.from(report.rtMr0).toString("hex"),
    rtMr1: Buffer.from(report.rtMr1).toString("hex"),
    rtMr2: Buffer.from(report.rtMr2).toString("hex"),
    rtMr3: Buffer.from(report.rtMr3).toString("hex"),
    appId: appEvents[0]!.event_payload.toLowerCase(),
    keyProviderHash: createHash("sha256")
      .update(Buffer.from(keyProviderEvents[0]!.event_payload, "hex"))
      .digest("hex"),
    composeHash,
    osImageHash,
  };
}

/** Parse deployment-manager evidence without treating its unsigned hashes as verified.
 * @param {unknown} value - Raw compose-manager attestation.
 * @returns {ComposeManagerEvidence} Parsed evidence requiring independent quote validation.
 */
export function parseComposeManagerEvidence(
  value: unknown,
): ComposeManagerEvidence {
  const parsed = ComposeManagerSchema.safeParse(value);
  if (!parsed.success) {
    throw privacyError("PRIVACY_MEASUREMENTS_INVALID");
  }
  return parsed.data;
}

/** Bind current deployment actions to a second verified quote for the same measured guest.
 * @param {ComposeManagerEvidence} manager - Parsed deployment history.
 * @param {TDReport10} managerReport - Independently authenticated manager quote.
 * @param {TDReport10} workloadReport - Independently authenticated inference quote.
 * @param {Uint8Array} nonce - Current request challenge.
 * @returns {string} Hardware-bound canonical actions hash.
 */
export function verifyComposeManagerMeasurements(
  manager: ComposeManagerEvidence,
  managerReport: TDReport10,
  workloadReport: TDReport10,
  nonce: Uint8Array,
): string {
  const actionsHash = createHash("sha256")
    .update(canonicalMeasurementJSON(manager.actions))
    .digest("hex");
  const replay = replayRuntimeMeasurements(manager.event_log);
  const sameGuest = [
    "mrTd",
    "mrConfigId",
    "rtMr0",
    "rtMr1",
    "rtMr2",
    "rtMr3",
  ] as const;
  if (
    manager.nonce.toLowerCase() !== Buffer.from(nonce).toString("hex") ||
    manager.actions_hash.toLowerCase() !== actionsHash ||
    !equalBytes(replay.digest, managerReport.rtMr3) ||
    sameGuest.some(
      (field) => !equalBytes(managerReport[field], workloadReport[field]),
    ) ||
    !equalBytes(
      managerReport.reportData.subarray(0, 32),
      Buffer.from(actionsHash, "hex"),
    ) ||
    !equalBytes(managerReport.reportData.subarray(32), nonce)
  ) {
    throw privacyError("PRIVACY_MEASUREMENTS_INVALID");
  }
  return actionsHash;
}

/** Require an application-approved boot, manifest, and current deployment profile.
 * @param {VeniceWorkloadMeasurements} measurements - Hardware-authenticated software identity.
 * @param {readonly VeniceWorkloadPolicy[] | undefined} policies - Independently approved references.
 * @param {Function} [onMismatch] - Receive field differences when every approved profile rejects.
 * @returns {void} Returns only for an exact approved profile.
 */
export function assertTrustedWorkload(
  measurements: VeniceWorkloadMeasurements,
  policies: readonly VeniceWorkloadPolicy[] | undefined,
  onMismatch?: (mismatch: PrivacyWorkloadMismatch) => void,
): void {
  const fields = [
    "mrTd",
    "rtMr0",
    "rtMr1",
    "rtMr2",
    "appId",
    "keyProviderHash",
    "composeHash",
    "osImageHash",
    "composeManagerActionsHash",
  ] as const;
  const profiles = (policies ?? []).map((policy, profileIndex) =>
    Object.freeze({
      profileIndex,
      differences: Object.freeze(
        fields.flatMap((field) =>
          policy[field]?.toLowerCase() === measurements[field]
            ? []
            : [
                Object.freeze({
                  field,
                  expected: policy[field] ?? null,
                  actual: measurements[field] ?? null,
                }),
              ],
        ),
      ),
    }),
  );
  if (profiles.some((profile) => profile.differences.length === 0)) {
    return;
  }
  onMismatch?.(
    Object.freeze({
      reason:
        profiles.length === 0 ? "no-approved-profiles" : "measurement-mismatch",
      profiles: Object.freeze(profiles),
    }),
  );
  throw privacyError("PRIVACY_WORKLOAD_UNTRUSTED");
}
