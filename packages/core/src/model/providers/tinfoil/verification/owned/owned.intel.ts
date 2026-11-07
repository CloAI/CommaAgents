import { X509Certificate } from "node:crypto";
import { intel, Quote, verify } from "@phala/dcap-qvl";
import { z } from "zod";
import {
  parseTinfoilDER,
  parseTinfoilCertificate,
  derOID,
  derTime,
} from "./owned.der";
import {
  decodeTinfoilBase64,
  parseTinfoilJSON,
  readTinfoilSignedJSONObject,
} from "./owned.json";
import { hex48 } from "./owned.schemas";
import type { TinfoilIntelQuote } from "./owned.types";

const pcsSchema = z
  .object({
    responses: z
      .array(
        z
          .object({
            url: z.string(),
            headers: z.record(z.array(z.string()).min(1).max(8)),
            body_base64: z.string(),
          })
          .strict(),
      )
      .length(4),
  })
  .strict();
const validity = z
  .object({
    issueDate: z.string().datetime(),
    nextUpdate: z.string().datetime(),
    tcbEvaluationDataNumber: z.number().int().nonnegative().safe(),
  })
  .passthrough();
const signedSchema = z
  .object({ signature: z.string().regex(/^[0-9a-f]{128}$/i) })
  .passthrough();
const policySchema = z
  .object({
    qe_vendor_id: z.string().regex(/^[0-9a-f]{32}$/),
    minimum_tee_tcb_svn: z.string().regex(/^[0-9a-f]{32}$/),
    mr_seam: hex48,
    td_attributes: z.string().regex(/^[0-9a-f]{16}$/),
    xfam: z.string().regex(/^[0-9a-f]{16}$/),
    minimum_tcb_evaluation_data_number: z.number().int().nonnegative().safe(),
    platform_measurements: z.array(z.string().min(1)).min(1).max(1024),
  })
  .strict();
const shapeSchema = z
  .object({
    cpus: z.number().int().positive(),
    memory_mb: z.number().int().positive(),
    disks: z.number().int().positive(),
    gpus: z.number().int().nonnegative().optional(),
  })
  .strict();
const measurementSchema = z
  .object({
    mrtd: hex48,
    rtmr0: hex48,
    shape: shapeSchema,
    stack: z.unknown().optional(),
  })
  .strict();

/** Authenticate offline Intel collateral and a TDX quote against the released verifier's pinned production root.
 * @param {Uint8Array} raw - Exact raw quote v4, with optional zero buffer padding.
 * @param {unknown} collateralData - Captured Intel PCS responses; no endpoint from this data is fetched.
 * @param {number} time - One caller-owned appraisal time.
 * @returns {TinfoilIntelQuote} Hardware-authenticated identity, report and collateral validity bounds.
 */
export function authenticateTinfoilIntel(
  raw: Uint8Array,
  collateralData: unknown,
  time: number,
): TinfoilIntelQuote {
  if (!Number.isFinite(time)) {
    throw new Error("Invalid CPU appraisal time");
  }
  const bytes = Buffer.from(raw);
  if (
    bytes.length < 636 ||
    bytes.readUInt16LE(0) !== 4 ||
    bytes.readUInt16LE(2) !== 2 ||
    bytes.readUInt32LE(4) !== 0x81 ||
    bytes.subarray(8, 12).some((v) => v !== 0)
  ) {
    throw new Error("Unsupported TDX quote header");
  }
  const end = 636 + bytes.readUInt32LE(632);
  if (end > bytes.length || bytes.subarray(end).some((v) => v !== 0)) {
    throw new Error("Invalid TDX quote length or trailing bytes");
  }
  const quoteBytes = bytes.subarray(0, end);
  const quote = Quote.parse(quoteBytes);
  quote.rawCertChain();
  const fmspc = Buffer.from(intel.getFmspc(quote)).toString("hex");
  const authority = intel.getCa(quote);
  if (
    !/^[0-9a-f]{12}$/.test(fmspc) ||
    !["processor", "platform"].includes(authority)
  ) {
    throw new Error("Invalid PCK collateral identity");
  }
  const captured = pcsSchema.parse(collateralData);
  const resources = new Map<
    string,
    { body: Uint8Array; headers: Map<string, string> }
  >();
  for (const entry of captured.responses) {
    const url = new URL(entry.url);
    if (url.protocol !== "https:" || url.username || url.password || url.hash) {
      throw new Error("Invalid PCS resource identity");
    }
    let kind: string;
    if (
      url.origin === "https://certificates.trustedservices.intel.com" &&
      url.pathname === "/IntelSGXRootCA.der" &&
      !url.search
    ) {
      kind = "root";
    } else if (url.origin === "https://api.trustedservices.intel.com") {
      const allowed = url.pathname.endsWith("/pckcrl")
        ? ["ca", "encoding"]
        : url.pathname.endsWith("/tcb")
          ? ["fmspc", "tcbEvaluationDataNumber"]
          : ["tcbEvaluationDataNumber", "update"];
      if (
        [...url.searchParams.keys()].some(
          (k) =>
            !allowed.includes(k) || url.searchParams.getAll(k).length !== 1,
        ) ||
        (url.searchParams.has("tcbEvaluationDataNumber") &&
          !/^[0-9]+$/.test(url.searchParams.get("tcbEvaluationDataNumber")!)) ||
        (url.searchParams.has("update") &&
          url.searchParams.get("update") !== "standard")
      ) {
        throw new Error("Invalid PCS resource query");
      }
      if (
        url.pathname === "/sgx/certification/v4/pckcrl" &&
        url.searchParams.get("ca") === authority &&
        url.searchParams.get("encoding") === "der"
      ) {
        kind = "pck";
      } else if (
        url.pathname === "/tdx/certification/v4/tcb" &&
        url.searchParams.get("fmspc") === fmspc
      ) {
        kind = "tcb";
      } else if (url.pathname === "/tdx/certification/v4/qe/identity") {
        kind = "qe";
      } else {
        throw new Error("Unrecognized PCS resource");
      }
    } else {
      throw new Error("Unrecognized PCS origin");
    }
    if (resources.has(kind)) {
      throw new Error("Duplicate PCS resource");
    }
    const headers = new Map<string, string>();
    for (const [name, values] of Object.entries(entry.headers)) {
      const key = name.toLowerCase();
      if (headers.has(key) || values.length !== 1) {
        throw new Error("Ambiguous PCS header");
      }
      headers.set(key, values[0]!);
    }
    resources.set(kind, {
      body: decodeTinfoilBase64(entry.body_base64),
      headers,
    });
  }
  const pck = resources.get("pck")!,
    root = resources.get("root")!,
    tcb = resources.get("tcb")!,
    qe = resources.get("qe")!;
  if (!pck || !root || !tcb || !qe) {
    throw new Error("Incomplete Intel collateral");
  }
  const chain = (resource: typeof pck, names: readonly string[]) => {
    const matches = names
      .map((n) => resource.headers.get(n))
      .filter((v): v is string => v !== undefined);
    if (matches.length !== 1 || matches[0]!.length > 65536) {
      throw new Error("Missing or ambiguous collateral issuer chain");
    }
    return decodeURIComponent(matches[0]!);
  };
  const tcbSigned = signedSchema.parse(parseTinfoilJSON(tcb.body));
  const qeSigned = signedSchema.parse(parseTinfoilJSON(qe.body));
  const tcbInfo = validity.parse(tcbSigned.tcbInfo),
    qeIdentity = validity.parse(qeSigned.enclaveIdentity);
  const pckIssuer = chain(pck, ["sgx-pck-crl-issuer-chain"]);
  const tcbIssuer = chain(tcb, [
    "tcb-info-issuer-chain",
    "sgx-tcb-info-issuer-chain",
  ]);
  const qeIssuer = chain(qe, ["sgx-enclave-identity-issuer-chain"]);
  const verified = verify(
    quoteBytes,
    {
      pck_crl_issuer_chain: pckIssuer,
      pck_crl: Array.from(pck.body),
      root_ca_crl: Array.from(root.body),
      tcb_info_issuer_chain: tcbIssuer,
      tcb_info: readTinfoilSignedJSONObject(tcb.body, "tcbInfo"),
      tcb_info_signature: Array.from(Buffer.from(tcbSigned.signature, "hex")),
      qe_identity_issuer_chain: qeIssuer,
      qe_identity: readTinfoilSignedJSONObject(qe.body, "enclaveIdentity"),
      qe_identity_signature: Array.from(Buffer.from(qeSigned.signature, "hex")),
    },
    Math.floor(time / 1000),
  );
  const report = verified.report.asTd10();
  if (
    verified.status !== "UpToDate" ||
    !report ||
    report.tdAttributes.length !== 8 ||
    (report.tdAttributes[0]! & 1) !== 0 ||
    report.reportData.length !== 64
  ) {
    throw new Error("TDX hardware or TCB verification rejected");
  }
  const pckChain = Buffer.from(quote.rawCertChain())
    .toString()
    .match(/-----BEGIN CERTIFICATE-----[\s\S]*?-----END CERTIFICATE-----/g);
  if (!pckChain?.[0]) {
    throw new Error("Missing authenticated PCK certificate");
  }
  const leaf = parseTinfoilCertificate(
    new X509Certificate(pckChain[0]).raw,
    time,
  );
  const extension = leaf.extensions.get("1.2.840.113741.1.13.1");
  if (!extension) {
    throw new Error("Missing Intel platform identity extension");
  }
  const fields = parseTinfoilDER(extension.value).children;
  const identifiers = fields.map((field) => derOID(field.children[0]!));
  if (new Set(identifiers).size !== fields.length) {
    throw new Error("Ambiguous Intel platform identity");
  }
  const identityField = fields.find(
    (field) => derOID(field.children[0]!) === "1.2.840.113741.1.13.1.1",
  );
  const identity = identityField?.children[1];
  if (
    identity?.tag !== 4 ||
    identity.value.length !== 16 ||
    identityField?.children.length !== 2
  ) {
    throw new Error("Invalid Intel PPID");
  }
  let expiresAt = Infinity;
  for (const crl of [pck.body, root.body]) {
    const body = parseTinfoilDER(crl).children[0]!;
    const offset = body.children[0]?.tag === 2 ? 1 : 0;
    const start = derTime(body.children[offset + 2]!),
      end = derTime(body.children[offset + 3]!);
    if (start > time || end <= time) {
      throw new Error("Intel revocation data outside its validity window");
    }
    expiresAt = Math.min(expiresAt, end);
  }
  for (const signed of [tcbInfo, qeIdentity]) {
    const start = Date.parse(signed.issueDate),
      end = Date.parse(signed.nextUpdate);
    if (start > time || end <= time) {
      throw new Error("Intel signed collateral outside its validity window");
    }
    expiresAt = Math.min(expiresAt, end);
  }
  for (const pem of [
    pckIssuer,
    tcbIssuer,
    qeIssuer,
    Buffer.from(quote.rawCertChain()).toString(),
  ]) {
    const certificates = pem.match(
      /-----BEGIN CERTIFICATE-----[\s\S]*?-----END CERTIFICATE-----/g,
    );
    if (!certificates || certificates.length < 2 || certificates.length > 4) {
      throw new Error("Malformed Intel issuer chain");
    }
    for (const cert of certificates) {
      const parsed = new X509Certificate(cert);
      const start = Date.parse(parsed.validFrom),
        end = Date.parse(parsed.validTo);
      if (start > time || end <= time) {
        throw new Error("Intel certificate outside its validity window");
      }
      expiresAt = Math.min(expiresAt, end);
    }
  }
  return {
    identity: Buffer.from(identity.value).toString("hex"),
    report,
    quote,
    tcbEvaluationDataNumber: Math.min(
      tcbInfo.tcbEvaluationDataNumber,
      qeIdentity.tcbEvaluationDataNumber,
    ),
    expiresAt,
  };
}

/** Enforce the full signed TDX platform policy and measured workload, including nonce/key/device binding.
 * @param {TinfoilIntelQuote} authenticated - Independently authenticated quote and collateral facts.
 * @param {unknown} policyData - Selected signed policy for this exact PCK hardware identity.
 * @param {Readonly<Record<string,unknown>>} platformMeasurements - Signed TDX boot configuration measurements.
 * @param {Readonly<Record<string,unknown>>} workload - Signed workload predicate with required runtime measurements and VM shape.
 * @param {Uint8Array} reportData - Expected caller challenge and endorsed-section binding.
 * @returns {void} Nothing; incomplete or mismatching policies reject.
 */
export function appraiseTinfoilIntel(
  authenticated: TinfoilIntelQuote,
  policyData: unknown,
  platformMeasurements: Readonly<Record<string, unknown>>,
  workload: Readonly<Record<string, unknown>>,
  reportData: Uint8Array,
): void {
  const p = policySchema.parse(policyData),
    r = authenticated.report;
  const code = z
    .object({
      tdx_measurement: z.object({ rtmr1: hex48, rtmr2: hex48 }).strict(),
      vm_shape: shapeSchema,
    })
    .passthrough()
    .parse(workload);
  const hex = (bytes: Uint8Array) => Buffer.from(bytes).toString("hex");
  if (
    hex(authenticated.quote.header.qeVendorId) !== p.qe_vendor_id ||
    hex(r.mrSeam) !== p.mr_seam ||
    hex(r.tdAttributes) !== p.td_attributes ||
    hex(r.xfam) !== p.xfam ||
    r.teeTcbSvn.length !== 16 ||
    r.teeTcbSvn.some(
      (byte, i) => byte < Buffer.from(p.minimum_tee_tcb_svn, "hex")[i]!,
    ) ||
    authenticated.tcbEvaluationDataNumber <
      p.minimum_tcb_evaluation_data_number ||
    !Buffer.from(r.reportData).equals(reportData) ||
    [r.mrConfigId, r.mrOwner, r.mrOwnerConfig, r.rtMr3].some(
      (v) => v.length !== 48 || v.some((b) => b !== 0),
    ) ||
    hex(r.rtMr1) !== code.tdx_measurement.rtmr1 ||
    hex(r.rtMr2) !== code.tdx_measurement.rtmr2
  ) {
    throw new Error("TDX platform/workload policy mismatch");
  }
  let matches = 0;
  for (const name of p.platform_measurements) {
    if (!Object.hasOwn(platformMeasurements, name)) {
      throw new Error("Missing TDX platform measurement");
    }
    const m = measurementSchema.parse(platformMeasurements[name]);
    if (
      m.mrtd === hex(r.mrTd) &&
      m.rtmr0 === hex(r.rtMr0) &&
      m.shape.cpus === code.vm_shape.cpus &&
      m.shape.memory_mb === code.vm_shape.memory_mb &&
      m.shape.disks === code.vm_shape.disks &&
      (m.shape.gpus === undefined ||
        code.vm_shape.gpus === undefined ||
        m.shape.gpus === code.vm_shape.gpus)
    ) {
      matches++;
    }
  }
  if (matches !== 1) {
    throw new Error("No unique TDX measurement matches this VM shape");
  }
}
