import { createHash, timingSafeEqual } from "node:crypto";
import { documentSchema, materialSchema, devicesSchema } from "./owned.schemas";
import { decodeTinfoilBase64, parseTinfoilJSON } from "./owned.json.ts";
import type { TinfoilReference } from "./owned.types";

/** Parse a caller-owned repository and optional release/digest pin.
 * @param {string} reference - Expected release identity.
 * @returns {TinfoilReference} Parsed constraints without server-derived approval.
 */
export function parseTinfoilReference(reference: string): TinfoilReference {
  const match =
    /^([A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+)(?:@([^@\s~^:?*[\\]+))??(?:@sha256:([0-9a-f]{64}))?$/.exec(
      reference,
    );
  if (!match) {
    throw new Error("Invalid trusted workload reference");
  }
  return {
    repo: match[1]!,
    ...(match[2] ? { tag: match[2] } : {}),
    ...(match[3] ? { digest: match[3] } : {}),
  };
}

/** Recompute V3 envelope bindings from original endorsed bytes and a caller nonce.
 * @param {Uint8Array} bytes - Original network response bytes.
 * @param {Uint8Array} nonce - Caller-generated 32-byte challenge.
 * @returns {object} Parsed, still unauthenticated evidence and expected hardware report-data binding.
 */
export function parseTinfoilDocument(bytes: Uint8Array, nonce: Uint8Array) {
  if (nonce.length !== 32) {
    throw new Error("Invalid attestation challenge");
  }
  const document = documentSchema.parse(parseTinfoilJSON(bytes));
  if (document.challenge.nonce !== Buffer.from(nonce).toString("hex")) {
    throw new Error("Attestation nonce mismatch");
  }
  const materialBytes = decodeTinfoilBase64(document.crypto_material);
  const deviceBytes = decodeTinfoilBase64(document.device_evidence);
  const materialHash = createHash("sha256").update(materialBytes).digest();
  const deviceHash = createHash("sha256").update(deviceBytes).digest();
  if (
    materialHash.toString("hex") !==
      document.cpu_evidence.endorsed.crypto_material_hash ||
    deviceHash.toString("hex") !==
      document.cpu_evidence.endorsed.device_evidence_hash
  ) {
    throw new Error("Endorsed section hash mismatch");
  }
  const expectedReportData = Buffer.concat([
    createHash("sha256")
      .update(
        Buffer.concat([
          Buffer.from(document.challenge.report_data_algorithm),
          nonce,
          materialHash,
          deviceHash,
        ]),
      )
      .digest(),
    Buffer.alloc(32),
  ]);
  if (
    !timingSafeEqual(
      expectedReportData,
      Buffer.from(document.challenge.report_data, "hex"),
    )
  ) {
    throw new Error("Invalid report-data derivation");
  }
  const material = materialSchema.parse(parseTinfoilJSON(materialBytes));
  const devices = devicesSchema.parse(parseTinfoilJSON(deviceBytes));
  for (const entries of [material.items, devices.items, document.collateral]) {
    if (new Set(entries.map((entry) => entry.id)).size !== entries.length) {
      throw new Error("Duplicate evidence identifier");
    }
  }
  for (const key of material.items) {
    if (
      [
        "https://tinfoil.sh/key/spki-fp-sha256/v1",
        "https://tinfoil.sh/key/x25519-hpke/v1",
      ].includes(key.format) &&
      !/^[0-9a-f]{64}$/.test(key.data)
    ) {
      throw new Error("Malformed endorsed key");
    }
  }
  const hpke = material.items.find(
    (key) =>
      key.id === "hpke" &&
      key.format === "https://tinfoil.sh/key/x25519-hpke/v1",
  );
  if (!hpke) {
    throw new Error("Attestation lacks an HPKE key");
  }
  return {
    document,
    expectedReportData,
    hpkeKey: hpke.data,
    cpuReport: decodeTinfoilBase64(document.cpu_evidence.report_base64),
  };
}
