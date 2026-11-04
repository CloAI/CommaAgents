import { z } from "zod";

export const hex32 = z.string().regex(/^[0-9a-f]{64}$/);
export const hex48 = z.string().regex(/^[0-9a-f]{96}$/);
const text = z.string().min(1);
export const collateralSchema = z
  .object({
    id: text,
    role: z.enum(["endorsement", "reference-values"]),
    format: text,
    subjects: z.array(text).optional(),
    data: z.record(z.unknown()),
  })
  .strict();
export const documentSchema = z
  .object({
    format: z.literal("https://tinfoil.sh/predicate/attestation/v3"),
    challenge: z
      .object({
        nonce: hex32,
        report_data: z.string().regex(/^[0-9a-f]{128}$/),
        report_data_algorithm: z.literal("https://tinfoil.sh/report-data/v1"),
      })
      .strict(),
    cpu_evidence: z
      .object({
        format: text,
        report_base64: text,
        endorsed: z
          .object({ crypto_material_hash: hex32, device_evidence_hash: hex32 })
          .strict(),
      })
      .strict(),
    crypto_material: text,
    device_evidence: text,
    collateral_format: z
      .literal("https://tinfoil.sh/predicate/attestation-collaterals/v2")
      .optional(),
    collateral: z.array(collateralSchema).min(1).max(128),
  })
  .strict();
export const materialSchema = z
  .object({
    format: z.literal("https://tinfoil.sh/crypto-material/v1"),
    items: z
      .array(
        z
          .object({
            id: text,
            format: text,
            data: z.string().regex(/^(?:[0-9a-f]{2})+$/),
          })
          .strict(),
      )
      .max(128),
  })
  .strict();
export const devicesSchema = z
  .object({
    format: z.literal("https://tinfoil.sh/device-evidence/v1"),
    items: z
      .array(z.object({ id: text, kind: text, vendor: text, format: text, evidence: z.unknown() }).strict())
      .max(128),
  })
  .strict();
export const referenceSchema = z
  .object({
    repo: text,
    tag: text,
    digest: hex32,
    sigstore_bundle: z.record(z.unknown()),
  })
  .strict();
export const freshnessSchema = z
  .object({ sigstore_bundle: z.record(z.unknown()) })
  .strict();
export const amdCertificateSchema = z
  .object({ vcek_der_base64: text, cert_chain_pem: text })
  .strict();
export const amdCrlSchema = z.object({ crl_der_base64: text }).strict();
export const statementSchema = z
  .object({
    _type: z.literal("https://in-toto.io/Statement/v1"),
    subject: z
      .array(
        z
          .object({ name: text, digest: z.object({ sha256: hex32 }).strict() })
          .strict(),
      )
      .length(1),
    predicateType: text,
    predicate: z.record(z.unknown()),
  })
  .strict();
