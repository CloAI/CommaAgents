import { X509Certificate, verify } from "node:crypto";
import { z } from "zod";
import roots from "./roots/amd.json";
import {
  parseTinfoilCertificate,
  parseTinfoilDER,
  derUnsigned,
  verifyTinfoilCRL,
} from "./owned.der";
import {
  amdCertificateSchema,
  amdCrlSchema,
  hex32,
  hex48,
} from "./owned.schemas";
import { decodeTinfoilBase64 } from "./owned.json";
import type { TinfoilCertificate } from "./owned.types";

const byte = z.number().int().min(0).max(255);
const tcb = z
  .object({ bl_spl: byte, tee_spl: byte, snp_spl: byte, ucode_spl: byte })
  .strict();
const flag = z.boolean().default(false);
const vector = z
  .union([z.bigint(), z.number().int().nonnegative().safe()])
  .transform(BigInt)
  .refine((n) => n >= 0n && n <= 0xffffffffffffffffn);
const policySchema = z
  .object({
    minimum_build: byte,
    minimum_api_version: z.string().regex(/^[0-9]{1,3}\.[0-9]{1,3}$/),
    minimum_abi_version: z.string().regex(/^[0-9]{1,3}\.[0-9]{1,3}$/),
    minimum_guest_svn: z.number().int().min(0).max(0xffffffff),
    minimum_tcb: tcb,
    minimum_launch_tcb: tcb,
    guest_policy: z
      .object({
        debug: z.literal(false),
        smt: flag,
        migrate_ma: z.literal(false),
        single_socket: flag,
        cxl_allowed: flag,
        mem_aes256_xts: flag,
        rapl_dis: flag,
        ciphertext_hiding_dram: flag,
        page_swap_disable: flag,
      })
      .strict(),
    platform_info: z
      .object({
        smt_enabled: flag,
        tsme_enabled: flag,
        ecc_enabled: flag,
        rapl_disabled: flag,
        ciphertext_hiding_dram: flag,
        alias_check_complete: flag,
        iommu_write_safe: flag,
        tio_enabled: flag,
      })
      .strict(),
    permit_provisional_firmware: z.literal(false),
    vmpl: z.literal(0),
    host_data: hex32,
    image_id: z.string().regex(/^[0-9a-f]{32}$/),
    family_id: z.string().regex(/^[0-9a-f]{32}$/),
    require_author_key: z.literal(false).optional(),
    require_id_block: z.literal(false).optional(),
    minimum_launch_mitigation_vector: vector,
    minimum_current_mitigation_vector: vector,
  })
  .strict();

/** Require manufacturer CA constraints rather than accepting an arbitrary signing certificate.
 * @param {TinfoilCertificate} cert - Manufacturer CA certificate.
 * @param {boolean} root - Require root CRL-signing usage and sufficient path length.
 * @returns {void} Nothing; invalid CA constraints reject.
 */
function validateCA(cert: TinfoilCertificate, root: boolean) {
  const basic = cert.extensions.get("2.5.29.19");
  const usage = cert.extensions.get("2.5.29.15");
  if (!cert.certificate.ca || !basic?.critical || !usage?.critical) {
    throw new Error("Invalid manufacturer CA");
  }
  const constraints = parseTinfoilDER(basic.value);
  const keyUsage = parseTinfoilDER(usage.value);
  if (
    constraints.tag !== 48 ||
    constraints.children[0]?.tag !== 1 ||
    constraints.children[0].value[0] !== 255 ||
    (constraints.children[1] &&
      derUnsigned(constraints.children[1]) < BigInt(root ? 1 : 0)) ||
    keyUsage.tag !== 3 ||
    !(keyUsage.value[1]! & 4) ||
    (root && !(keyUsage.value[1]! & 2))
  ) {
    throw new Error("Invalid manufacturer CA usage");
  }
}

/** Authenticate the current Genoa VCEK chain, chip/TCB certificate extensions and signed CPU report.
 * @param {Uint8Array} report - Original AMD report bytes.
 * @param {unknown} certificateData - Supplied AMD endorsement collateral.
 * @param {unknown} crlData - Supplied AMD revocation collateral.
 * @param {number} time - Single appraisal time.
 * @returns {void} Nothing; any authentication failure rejects.
 */
export function authenticateTinfoilAMD(
  report: Uint8Array,
  certificateData: unknown,
  crlData: unknown,
  time: number,
): void {
  const bytes = Buffer.from(report);
  if (
    bytes.length !== 1184 ||
    bytes.readUInt32LE(0) !== 3 ||
    bytes.readUInt32LE(0x34) !== 1 ||
    bytes[0x188] !== 0x19 ||
    bytes[0x189] !== 0x11 ||
    bytes[0x18a] !== 1 ||
    bytes.readUInt32LE(0x48) !== 0
  ) {
    throw new Error("Unsupported AMD report/platform");
  }
  for (const [start, end] of [
    [0x4c, 0x50],
    [0x18b, 0x1a0],
    [0x1eb, 0x1ec],
    [0x1ef, 0x1f0],
    [0x208, 0x2a0],
    [0x2d0, 0x2e8],
    [0x318, 0x330],
    [0x330, 1184],
  ]) {
    if (bytes.subarray(start, end).some((b) => b !== 0)) {
      throw new Error("Nonzero reserved report bytes");
    }
  }
  const supplied = amdCertificateSchema.parse(certificateData);
  // Pin the manufacturer's chain; endpoint collateral never supplies a new trust root.
  const pemPattern =
    /-----BEGIN CERTIFICATE-----[\s\S]*?-----END CERTIFICATE-----/g;
  const pinned = roots.genoaChainPem.match(pemPattern)!;
  const presented = supplied.cert_chain_pem.match(pemPattern);
  if (
    !presented ||
    presented.length !== 2 ||
    supplied.cert_chain_pem.replace(pemPattern, "").trim()
  ) {
    throw new Error("Invalid AMD chain");
  }
  const chain = pinned.map((pem) =>
    parseTinfoilCertificate(new X509Certificate(pem).raw, time),
  );
  if (
    presented.some(
      (pem, index) =>
        !new X509Certificate(pem).raw.equals(chain[index]!.certificate.raw),
    )
  ) {
    throw new Error("Untrusted AMD chain");
  }
  const [ask, ark] = chain as [TinfoilCertificate, TinfoilCertificate];
  validateCA(ark, true);
  validateCA(ask, false);
  const leaf = parseTinfoilCertificate(
    decodeTinfoilBase64(supplied.vcek_der_base64),
    time,
  );
  if (
    leaf.certificate.ca ||
    !ark.certificate.verify(ark.certificate.publicKey) ||
    !ask.certificate.verify(ark.certificate.publicKey) ||
    !Buffer.from(ask.issuer).equals(ark.subject) ||
    !leaf.certificate.verify(ask.certificate.publicKey) ||
    !Buffer.from(leaf.issuer).equals(ask.subject) ||
    leaf.certificate.publicKey.asymmetricKeyType !== "ec" ||
    leaf.certificate.publicKey.asymmetricKeyDetails?.namedCurve !== "secp384r1"
  ) {
    throw new Error("AMD certificate signature rejected");
  }
  const revoked = verifyTinfoilCRL(
    decodeTinfoilBase64(amdCrlSchema.parse(crlData).crl_der_base64),
    [ark],
    time,
  );
  if (revoked.has(BigInt(`0x${ask.certificate.serialNumber}`).toString(16))) {
    throw new Error("AMD signing certificate revoked");
  }
  const oid = "1.3.6.1.4.1.3704.1.";
  const integer = (suffix: string) =>
    derUnsigned(
      parseTinfoilDER(
        leaf.extensions.get(oid + suffix)?.value ?? new Uint8Array(),
      ),
    );
  const product = parseTinfoilDER(
    leaf.extensions.get(`${oid}2`)?.value ?? new Uint8Array(),
  );
  if (
    integer("1") !== 0n ||
    product.tag !== 22 ||
    !/^Genoa(?:-B[0-9])?$/.test(Buffer.from(product.value).toString()) ||
    !Buffer.from(leaf.extensions.get(`${oid}4`)?.value ?? []).equals(
      bytes.subarray(0x1a0, 0x1e0),
    )
  ) {
    throw new Error("VCEK chip identity mismatch");
  }
  for (const [slot, suffix] of [
    [0, "3.1"],
    [1, "3.2"],
    [2, "3.4"],
    [3, "3.5"],
    [4, "3.6"],
    [5, "3.7"],
    [6, "3.3"],
    [7, "3.8"],
  ] as const) {
    if (integer(suffix) !== BigInt(bytes[0x180 + slot]!)) {
      throw new Error("VCEK TCB mismatch");
    }
  }
  const r = Buffer.from(bytes.subarray(0x2a0, 0x2d0)).reverse();
  const s = Buffer.from(bytes.subarray(0x2e8, 0x318)).reverse();
  if (
    !verify(
      "sha384",
      bytes.subarray(0, 0x2a0),
      { key: leaf.certificate.publicKey, dsaEncoding: "ieee-p1363" },
      Buffer.concat([r, s]),
    )
  ) {
    throw new Error("AMD report signature rejected");
  }
}

/** Compare a signed AMD policy with every security-relevant report field and workload measurement.
 * @param {Uint8Array} report - Already authenticated report.
 * @param {unknown} policyData - Policy selected by chip ID from authenticated platform endorsements.
 * @param {string} launch - Launch measurement from authenticated workload release.
 * @param {Uint8Array} reportData - Caller nonce and endorsed-key binding.
 * @returns {void} Nothing; policy/binding mismatch rejects.
 */
export function appraiseTinfoilAMD(
  report: Uint8Array,
  policyData: unknown,
  launch: string,
  reportData: Uint8Array,
): void {
  const p = policySchema.parse(policyData);
  hex48.parse(launch);
  const b = Buffer.from(report);
  if (
    !b.subarray(0x50, 0x90).equals(reportData) ||
    b.subarray(0x90, 0xc0).toString("hex") !== launch ||
    b.readUInt32LE(4) < p.minimum_guest_svn ||
    b.readUInt32LE(0x30) !== p.vmpl ||
    b.subarray(0xc0, 0xe0).toString("hex") !== p.host_data ||
    b.subarray(0x10, 0x20).toString("hex") !== p.family_id ||
    b.subarray(0x20, 0x30).toString("hex") !== p.image_id ||
    b.subarray(0xe0, 0x140).some((v) => v !== 0) ||
    b.readBigUInt64LE(0x1f8) < p.minimum_launch_mitigation_vector ||
    b.readBigUInt64LE(0x200) < p.minimum_current_mitigation_vector
  ) {
    throw new Error("AMD workload or report-data policy mismatch");
  }
  const api = p.minimum_api_version.split(".").map(Number);
  const abi = p.minimum_abi_version.split(".").map(Number);
  if ([...api, ...abi].some((v) => v > 255)) {
    throw new Error("Invalid policy version");
  }
  const floor = api[0]! * 256 + api[1]!;
  const current = b[0x1ea]! * 256 + b[0x1e9]!;
  const committed = b[0x1ee]! * 256 + b[0x1ed]!;
  if (
    current < floor ||
    committed < floor ||
    (current === floor && b[0x1e8]! < p.minimum_build) ||
    (committed === floor && b[0x1ec]! < p.minimum_build) ||
    current !== committed ||
    b[0x1e8] !== b[0x1ec]
  ) {
    throw new Error("AMD firmware version rejected");
  }
  const guest = b.readBigUInt64LE(8);
  const abiVersion = Number(guest & 65535n);
  let expectedGuest = 1n << 17n;
  const guestFlags = [
    "smt",
    "migrate_ma",
    "debug",
    "single_socket",
    "cxl_allowed",
    "mem_aes256_xts",
    "rapl_dis",
    "ciphertext_hiding_dram",
    "page_swap_disable",
  ] as const;
  guestFlags.forEach((name, i) => {
    if (p.guest_policy[name]) {
      expectedGuest |= 1n << BigInt(i === 0 ? 16 : i + 17);
    }
  });
  if (
    abiVersion < abi[0]! * 256 + abi[1]! ||
    (guest & ~65535n) !== expectedGuest
  ) {
    throw new Error("AMD guest security policy rejected");
  }
  const infoKeys = [
    "smt_enabled",
    "tsme_enabled",
    "ecc_enabled",
    "rapl_disabled",
    "ciphertext_hiding_dram",
    "alias_check_complete",
    "iommu_write_safe",
    "tio_enabled",
  ] as const;
  let expectedInfo = 0n;
  infoKeys.forEach((name, i) => {
    if (p.platform_info[name]) {
      expectedInfo |= 1n << BigInt(i);
    }
  });
  if (b.readBigUInt64LE(0x40) !== expectedInfo) {
    throw new Error("AMD platform security policy rejected");
  }
  const slots = [0, 1, 6, 7];
  const minimum = [
    p.minimum_tcb.bl_spl,
    p.minimum_tcb.tee_spl,
    p.minimum_tcb.snp_spl,
    p.minimum_tcb.ucode_spl,
  ];
  const minimumLaunch = [
    p.minimum_launch_tcb.bl_spl,
    p.minimum_launch_tcb.tee_spl,
    p.minimum_launch_tcb.snp_spl,
    p.minimum_launch_tcb.ucode_spl,
  ];
  for (const offset of [0x38, 0x180, 0x1e0, 0x1f0]) {
    if (b.subarray(offset + 2, offset + 6).some((v) => v !== 0)) {
      throw new Error("Unsupported AMD TCB layout");
    }
    for (let i = 0; i < slots.length; i++) {
      if (
        b[offset + slots[i]!]! <
        (offset === 0x1f0 ? minimumLaunch[i]! : minimum[i]!)
      ) {
        throw new Error("AMD security patch level rejected");
      }
    }
  }
  if (!b.subarray(0x38, 0x40).equals(b.subarray(0x1e0, 0x1e8))) {
    throw new Error("Provisional AMD firmware rejected");
  }
  for (const slot of slots) {
    if (b[0x1f0 + slot]! > b[0x38 + slot]!) {
      throw new Error("AMD launch TCB exceeds current TCB");
    }
  }
}
