import { createPublicKey, verify } from "node:crypto";
import {
  SigstoreVerifier,
  type SigstoreBundle,
  type TrustedRoot,
} from "@freedomofpress/sigstore-browser";
import { z } from "zod";
import trustRoot from "./roots/sigstore.json";
import { decodeTinfoilBase64, parseTinfoilJSON } from "./owned.json.ts";
import {
  referenceSchema,
  freshnessSchema,
  statementSchema,
} from "./owned.schemas";
import type { TinfoilReference, TinfoilSignedRelease } from "./owned.types";

const trustedRoot: TrustedRoot = trustRoot;
const bundleSchema = z
  .object({
    mediaType: z.literal("application/vnd.dev.sigstore.bundle.v0.3+json"),
    dsseEnvelope: z
      .object({
        payloadType: z.literal("application/vnd.in-toto+json"),
        payload: z.string(),
        signatures: z
          .array(
            z
              .object({ sig: z.string(), keyid: z.string().optional() })
              .strict(),
          )
          .length(1),
      })
      .strict(),
    verificationMaterial: z
      .object({
        certificate: z.object({ rawBytes: z.string() }).strict(),
        tlogEntries: z
          .array(
            z
              .object({
                logIndex: z.string().regex(/^(0|[1-9][0-9]*)$/),
                logId: z.object({ keyId: z.string() }).strict(),
                kindVersion: z
                  .object({
                    kind: z.literal("dsse"),
                    version: z.literal("0.0.1"),
                  })
                  .strict(),
                integratedTime: z.string().regex(/^[1-9][0-9]*$/),
                inclusionPromise: z
                  .object({ signedEntryTimestamp: z.string() })
                  .strict(),
                inclusionProof: z
                  .object({
                    logIndex: z.string(),
                    rootHash: z.string(),
                    treeSize: z.string(),
                    hashes: z.array(z.string()),
                    checkpoint: z.object({ envelope: z.string() }).strict(),
                  })
                  .strict(),
                canonicalizedBody: z.string(),
              })
              .strict(),
          )
          .min(1)
          .max(16),
        timestampVerificationData: z
          .object({
            rfc3161Timestamps: z
              .array(z.object({ signedTimestamp: z.string() }).strict())
              .max(16)
              .default([]),
          })
          .strict()
          .optional(),
      })
      .strict(),
  })
  .strict();

/** Verify a signed statement and independently authenticate its Rekor timestamps.
 * @param {unknown} data - Untrusted DSSE bundle.
 * @param {object} expected - Required GitHub signing identity.
 * @param {number} time - Single appraisal time.
 * @returns {Promise<object>} Authenticated statement, commit, and log timestamp.
 */
async function verifyStatement(
  data: unknown,
  expected: { repo: string; ref: string; workflow?: string },
  time: number,
) {
  const bundle: SigstoreBundle = bundleSchema.parse(data);
  const verifier = new SigstoreVerifier({
    tlogThreshold: 1,
    ctlogThreshold: 1,
  });
  await verifier.loadSigstoreRoot(trustedRoot);
  let commit: string | undefined;
  const prefix = `https://github.com/${expected.repo}/.github/workflows/`;
  const payload = await verifier.verifyDsse(bundle, {
    verify(cert) {
      const san = cert.subjectAltName;
      const workflow = san?.slice(prefix.length).split("@");
      if (
        cert.extFulcioIssuerV2?.issuer !==
          "https://token.actions.githubusercontent.com" ||
        cert.extRunnerEnvironment?.runnerEnvironment !== "github-hosted" ||
        cert.extSourceRepositoryURI?.sourceRepositoryURI !==
          `https://github.com/${expected.repo}` ||
        cert.extSourceRepositoryRef?.sourceRepositoryRef !== expected.ref ||
        !san?.startsWith(prefix) ||
        !workflow ||
        workflow.length !== 2 ||
        !/^[^/@]+\.ya?ml$/.test(workflow[0]!) ||
        workflow[1] !== expected.ref ||
        (expected.workflow && workflow[0] !== expected.workflow)
      ) {
        throw new Error("Unapproved signing identity");
      }
      commit = cert.extSourceRepositoryDigest?.sourceRepositoryDigest;
      if (!commit || !/^[0-9a-f]{40}$/.test(commit)) {
        throw new Error("Missing signed release commit");
      }
    },
  });
  const timestamps = bundle.verificationMaterial.tlogEntries.map((entry) => {
    const log = trustedRoot.tlogs.find(
      (log) => log.logId.keyId === entry.logId.keyId,
    );
    const seconds = Number(entry.integratedTime);
    const index = Number(entry.logIndex);
    if (
      !log ||
      !Number.isSafeInteger(seconds) ||
      !Number.isSafeInteger(index) ||
      seconds * 1000 > time + 300000 ||
      seconds * 1000 < Date.parse(log.publicKey.validFor.start) ||
      (log.publicKey.validFor.end &&
        seconds * 1000 > Date.parse(log.publicKey.validFor.end))
    ) {
      throw new Error("Untrusted log timestamp");
    }
    const set = JSON.stringify({
      body: entry.canonicalizedBody,
      integratedTime: seconds,
      logID: Buffer.from(decodeTinfoilBase64(entry.logId.keyId)).toString(
        "hex",
      ),
      logIndex: index,
    });
    if (
      !verify(
        "sha256",
        Buffer.from(set),
        createPublicKey({
          key: Buffer.from(decodeTinfoilBase64(log.publicKey.rawBytes)),
          format: "der",
          type: "spki",
        }),
        decodeTinfoilBase64(entry.inclusionPromise!.signedEntryTimestamp),
      )
    ) {
      throw new Error("Invalid signed log timestamp");
    }
    return seconds * 1000;
  });
  if (!commit || payload.payloadType !== "application/vnd.in-toto+json") {
    throw new Error("Unauthenticated statement");
  }
  return {
    statement: statementSchema.parse(parseTinfoilJSON(payload.payload)),
    commit,
    loggedAt: Math.min(...timestamps),
  };
}

/** Verify release identity and the first signed artifact digest, never endpoint assertions.
 * @param {unknown} data - Untrusted release collateral.
 * @param {TinfoilReference} expected - Caller-owned repository and optional release pins.
 * @param {number} time - Single appraisal time.
 * @param {boolean} platform - Require the dedicated platform release workflow.
 * @returns {Promise<TinfoilSignedRelease>} Authenticated statement and release identity.
 */
export async function verifyTinfoilRelease(
  data: unknown,
  expected: TinfoilReference,
  time: number,
  platform = false,
): Promise<TinfoilSignedRelease> {
  const reference = referenceSchema.parse(data);
  if (
    reference.repo !== expected.repo ||
    (expected.tag && reference.tag !== expected.tag) ||
    (expected.digest && reference.digest !== expected.digest) ||
    !/^[^@\s]+$/.test(reference.tag) ||
    (platform && !/^platform-v[0-9]/.test(reference.tag))
  ) {
    throw new Error("Unapproved release reference");
  }
  const verified = await verifyStatement(
    reference.sigstore_bundle,
    {
      repo: expected.repo,
      ref: `refs/tags/${reference.tag}`,
      ...(platform ? { workflow: "platform-release.yml" } : {}),
    },
    time,
  );
  if (verified.statement.subject[0]!.digest.sha256 !== reference.digest) {
    throw new Error("Artifact digest mismatch");
  }
  return {
    ...verified,
    repo: reference.repo,
    tag: reference.tag,
    digest: reference.digest,
  };
}

/** Authenticate a current witness for this exact signed release and derive its expiry.
 * @param {unknown} data - Untrusted freshness collateral.
 * @param {TinfoilSignedRelease} release - Already authenticated release.
 * @param {number} time - Single appraisal time.
 * @param {number} maxAge - Maximum permitted witness age.
 * @returns {Promise<number>} Authenticated expiry in milliseconds.
 */
export async function verifyTinfoilWitness(
  data: unknown,
  release: TinfoilSignedRelease,
  time: number,
  maxAge: number,
): Promise<number> {
  const witness = await verifyStatement(
    freshnessSchema.parse(data).sigstore_bundle,
    {
      repo: "tinfoilsh/freshness-witness",
      ref: "refs/heads/main",
      workflow: "freshness.yml",
    },
    time,
  );
  const format = "https://tinfoil.sh/predicate/freshness-witness/v1";
  const predicate = z
    .object({
      format: z.literal(format),
      endorses: z
        .object({
          repo: z.string(),
          tag: z.string(),
          commit: z.string(),
          subject: z.object({ name: z.string(), digest: z.string() }).strict(),
        })
        .strict(),
    })
    .strict()
    .parse(witness.statement.predicate);
  const subject = release.statement.subject[0]!;
  if (
    witness.statement.predicateType !== format ||
    predicate.endorses.repo !== release.repo ||
    predicate.endorses.tag !== release.tag ||
    predicate.endorses.commit !== release.commit ||
    predicate.endorses.subject.name !== subject.name ||
    predicate.endorses.subject.digest !== `sha256:${release.digest}` ||
    witness.statement.subject[0]!.name !== subject.name ||
    witness.statement.subject[0]!.digest.sha256 !== release.digest ||
    witness.loggedAt + maxAge <= time
  ) {
    throw new Error("Missing or expired release witness");
  }
  return witness.loggedAt + maxAge;
}
