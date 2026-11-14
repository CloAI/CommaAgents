import { X509Certificate, constants, verify } from "node:crypto";
import type { DerNode, TinfoilCertificate } from "./owned.types";

/** Decode one canonical DER value while retaining exact signed spans.
 * @param {Uint8Array} bytes - Certificate, CRL, or extension encoding.
 * @returns {DerNode} Strictly parsed DER tree.
 */
export function parseTinfoilDER(bytes: Uint8Array): DerNode {
  if (bytes.length > 1024 * 1024) {
    throw new Error("DER size limit exceeded");
  }
  let position = 0;
  let nodes = 0;
  const read = (depth: number): DerNode => {
    if (depth > 32 || ++nodes > 32768 || position + 2 > bytes.length) {
      throw new Error("Invalid DER structure");
    }
    const start = position;
    const tag = bytes[position++]!;
    if (tag === 0 || (tag & 31) === 31) {
      throw new Error("Unsupported DER tag");
    }
    const lengthByte = bytes[position++]!;
    let length = lengthByte;
    if (lengthByte >= 128) {
      const count = lengthByte & 127;
      if (
        !count ||
        count > 4 ||
        position + count > bytes.length ||
        bytes[position] === 0
      ) {
        throw new Error("Noncanonical DER length");
      }
      length = 0;
      for (let index = 0; index < count; index++) {
        length = length * 256 + bytes[position++]!;
      }
      if (length < 128) {
        throw new Error("Noncanonical DER length");
      }
    }
    const begin = position;
    const end = begin + length;
    if (end > bytes.length) {
      throw new Error("Truncated DER value");
    }
    const children: DerNode[] = [];
    if (tag & 32) {
      while (position < end) {
        children.push(read(depth + 1));
      }
      if (position !== end) {
        throw new Error("Invalid DER child length");
      }
    } else {
      position = end;
    }
    const value = bytes.subarray(begin, end);
    if (tag === 1 && (length !== 1 || (value[0] !== 0 && value[0] !== 255))) {
      throw new Error("Noncanonical DER BOOLEAN");
    }
    if (
      tag === 2 &&
      (!length ||
        (length > 1 &&
          ((value[0] === 0 && value[1]! < 128) ||
            (value[0] === 255 && value[1]! >= 128))))
    ) {
      throw new Error("Noncanonical DER INTEGER");
    }
    if (
      tag === 3 &&
      (!length ||
        value[0]! > 7 ||
        (length === 1 && value[0] !== 0) ||
        (length > 1 && (value[length - 1]! & ((1 << value[0]!) - 1)) !== 0))
    ) {
      throw new Error("Invalid DER BIT STRING");
    }
    if (tag === 5 && length) {
      throw new Error("Invalid DER NULL");
    }
    if (tag === 12) {
      new TextDecoder("utf-8", { fatal: true }).decode(value);
    }
    if (tag === 22 && value.some((byte) => byte > 127)) {
      throw new Error("Invalid DER IA5 string");
    }
    if (tag === 23 || tag === 24) {
      derTime({ tag, value } as DerNode);
    }
    if (
      tag === 49 &&
      children.some(
        (child, index) =>
          index > 0 &&
          Buffer.compare(
            Buffer.from(children[index - 1]!.bytes),
            Buffer.from(child.bytes),
          ) > 0,
      )
    ) {
      throw new Error("Noncanonical DER SET");
    }
    return { tag, value, bytes: bytes.subarray(start, end), children };
  };
  const node = read(0);
  if (position !== bytes.length) {
    throw new Error("Trailing DER bytes");
  }
  return node;
}

/** Decode a DER object identifier with minimal base-128 sub-identifiers.
 * @param {DerNode} node - OID node.
 * @returns {string} Dotted object identifier.
 */
export function derOID(node: DerNode): string {
  if (node.tag !== 6 || !node.value.length) {
    throw new Error("Missing object identifier");
  }
  const values: bigint[] = [];
  let value = 0n;
  let initial = true;
  for (const byte of node.value) {
    if (initial && byte === 128) {
      throw new Error("Noncanonical OID");
    }
    value = value * 128n + BigInt(byte & 127);
    initial = false;
    if (!(byte & 128)) {
      values.push(value);
      value = 0n;
      initial = true;
    }
  }
  if (!initial) {
    throw new Error("Truncated object identifier");
  }
  const first = values.shift()!;
  const prefix =
    first < 40n
      ? [0n, first]
      : first < 80n
        ? [1n, first - 40n]
        : [2n, first - 80n];
  return [...prefix, ...values].join(".");
}

/** Decode an unsigned DER integer without losing precision.
 * @param {DerNode} node - Integer node.
 * @returns {bigint} Unsigned value.
 */
export function derUnsigned(node: DerNode): bigint {
  if (node.tag !== 2 || !node.value.length || node.value[0]! >= 128) {
    throw new Error("Invalid positive DER integer");
  }
  return BigInt(`0x${Buffer.from(node.value).toString("hex")}`);
}

/** Decode a canonical PKIX UTC or generalized timestamp.
 * @param {DerNode} node - Time node.
 * @returns {number} Epoch milliseconds.
 */
export function derTime(node: DerNode): number {
  const encoded = Buffer.from(node.value).toString("ascii");
  if (!(node.tag === 23 ? /^[0-9]{12}Z$/ : /^[0-9]{14}Z$/).test(encoded)) {
    throw new Error("Invalid PKIX timestamp");
  }
  const year =
    node.tag === 23
      ? `${Number(encoded.slice(0, 2)) >= 50 ? "19" : "20"}${encoded.slice(0, 2)}`
      : encoded.slice(0, 4);
  const rest = encoded.slice(node.tag === 23 ? 2 : 4, -1);
  const iso = `${year}-${rest.slice(0, 2)}-${rest.slice(2, 4)}T${rest.slice(4, 6)}:${rest.slice(6, 8)}:${rest.slice(8, 10)}.000Z`;
  const time = Date.parse(iso);
  if (!Number.isFinite(time) || new Date(time).toISOString() !== iso) {
    throw new Error("Invalid PKIX timestamp");
  }
  return time;
}

/** Authenticate a manufacturer-issued X.509 certificate and reject unsupported critical extensions.
 * @param {Uint8Array} bytes - DER certificate bytes.
 * @param {number} time - Owning appraisal time.
 * @returns {TinfoilCertificate} Parsed certificate; signature/path verification remains caller-owned.
 */
export function parseTinfoilCertificate(
  bytes: Uint8Array,
  time: number,
): TinfoilCertificate {
  if (bytes.length > 65536) {
    throw new Error("Certificate size limit exceeded");
  }
  const tree = parseTinfoilDER(bytes);
  if (tree.tag !== 48 || tree.children.length !== 3) {
    throw new Error("Invalid certificate");
  }
  const body = tree.children[0]!;
  const offset = body.children[0]?.tag === 160 ? 1 : 0;
  if (
    !Buffer.from(body.children[offset + 1]!.bytes).equals(
      tree.children[1]!.bytes,
    )
  ) {
    throw new Error("Certificate signature algorithm mismatch");
  }
  const certificate = new X509Certificate(bytes);
  if (
    time < Date.parse(certificate.validFrom) ||
    time > Date.parse(certificate.validTo)
  ) {
    throw new Error("Certificate expired or not yet valid");
  }
  const extensions = new Map<
    string,
    { critical: boolean; value: Uint8Array }
  >();
  const container = body.children.find((node) => node.tag === 163);
  for (const extension of container?.children[0]?.children ?? []) {
    const oid = derOID(extension.children[0]!);
    const critical = extension.children[1]?.tag === 1;
    const octets = extension.children[critical ? 2 : 1];
    if (
      extensions.has(oid) ||
      extension.children.length !== (critical ? 3 : 2) ||
      octets?.tag !== 4
    ) {
      throw new Error("Invalid certificate extensions");
    }
    const enabled = critical && extension.children[1]!.value[0] === 255;
    if (enabled && !["2.5.29.19", "2.5.29.15"].includes(oid)) {
      throw new Error("Unsupported critical certificate extension");
    }
    extensions.set(oid, { critical: enabled, value: octets.value });
  }
  return {
    certificate,
    issuer: body.children[offset + 2]!.bytes,
    subject: body.children[offset + 4]!.bytes,
    extensions,
  };
}

/** Verify an AMD revocation list using its issuer and exact signed DER bytes.
 * @param {Uint8Array} bytes - DER revocation list.
 * @param {TinfoilCertificate[]} issuers - Authenticated ASK/ARK certificates.
 * @param {number} time - Owning appraisal time.
 * @returns {Set<string>} Revoked unsigned certificate serials.
 */
export function verifyTinfoilCRL(
  bytes: Uint8Array,
  issuers: readonly TinfoilCertificate[],
  time: number,
): Set<string> {
  const root = parseTinfoilDER(bytes);
  if (root.tag !== 48 || root.children.length !== 3) {
    throw new Error("Invalid CRL");
  }
  const body = root.children[0]!;
  const offset = body.children[0]?.tag === 2 ? 1 : 0;
  const algorithm = body.children[offset]!;
  if (!Buffer.from(algorithm.bytes).equals(root.children[1]!.bytes)) {
    throw new Error("CRL signature algorithm mismatch");
  }
  const issuerName = body.children[offset + 1]!.bytes;
  const issuer = issuers.find((entry) =>
    Buffer.from(entry.subject).equals(issuerName),
  );
  if (
    !issuer ||
    derTime(body.children[offset + 2]!) > time ||
    derTime(body.children[offset + 3]!) <= time
  ) {
    throw new Error("Untrusted or expired CRL");
  }
  const oid = derOID(algorithm.children[0]!);
  let digest = "sha384";
  let padding: number | undefined;
  let saltLength: number | undefined;
  if (oid === "1.2.840.113549.1.1.10") {
    padding = constants.RSA_PKCS1_PSS_PADDING;
    const parameters = algorithm.children[1];
    if (
      parameters?.tag !== 48 ||
      parameters.children.some(
        (node, index) =>
          ![160, 161, 162, 163].includes(node.tag) ||
          (index > 0 && node.tag <= parameters.children[index - 1]!.tag) ||
          node.children.length !== 1,
      ) ||
      (parameters.children.find((node) => node.tag === 163) &&
        derUnsigned(
          parameters.children.find((node) => node.tag === 163)!.children[0]!,
        ) !== 1n)
    ) {
      throw new Error("Invalid CRL RSA-PSS parameters");
    }
    const hash = parameters?.children.find((node) => node.tag === 160)
      ?.children[0];
    const mgf = parameters?.children.find((node) => node.tag === 161)
      ?.children[0];
    const salt = parameters?.children.find((node) => node.tag === 162)
      ?.children[0];
    if (
      !hash ||
      derOID(hash.children[0]!) !== "2.16.840.1.101.3.4.2.2" ||
      !mgf ||
      derOID(mgf.children[0]!) !== "1.2.840.113549.1.1.8" ||
      derOID(mgf.children[1]!.children[0]!) !== "2.16.840.1.101.3.4.2.2" ||
      !salt
    ) {
      throw new Error("Unsupported CRL RSA-PSS parameters");
    }
    saltLength = Number(derUnsigned(salt));
    if (saltLength !== 48) {
      throw new Error("Unsupported CRL RSA-PSS salt");
    }
  } else if (oid === "1.2.840.113549.1.1.12") {
    padding = constants.RSA_PKCS1_PADDING;
  } else if (oid === "1.2.840.10045.4.3.3") {
    digest = "sha384";
  } else {
    throw new Error("Unsupported CRL signature");
  }
  const signature = root.children[2]!;
  if (
    signature.tag !== 3 ||
    signature.value[0] !== 0 ||
    !verify(
      digest,
      body.bytes,
      {
        key: issuer.certificate.publicKey,
        ...(padding === undefined ? {} : { padding }),
        ...(saltLength === undefined ? {} : { saltLength }),
      },
      signature.value.subarray(1),
    )
  ) {
    throw new Error("CRL signature rejected");
  }
  const revoked = new Set<string>();
  const entries = body.children[offset + 4];
  if (entries?.tag === 48) {
    for (const entry of entries.children) {
      revoked.add(derUnsigned(entry.children[0]!).toString(16));
    }
  }
  const extensions = body.children.find((node) => node.tag === 160);
  for (const extension of extensions?.children[0]?.children ?? []) {
    const extensionOID = derOID(extension.children[0]!);
    if (
      extensionOID === "2.5.29.27" ||
      (extension.children[1]?.tag === 1 && extension.children[1].value[0] !== 0)
    ) {
      throw new Error("Unsupported critical CRL extension");
    }
  }
  return revoked;
}
