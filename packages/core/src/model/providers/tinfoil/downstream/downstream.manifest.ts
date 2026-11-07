import { createHash } from "node:crypto";
import { z } from "zod";
import { parseTinfoilJSON } from "../verification/owned/owned.json";
import { parseTinfoilReference } from "../verification/owned/owned.document";
import { hex32 } from "../verification/owned/owned.schemas";
import { privacyError } from "../../../privacy/privacy.utils";
import type { TinfoilAdmittedPool } from "./downstream.types";

const hostSchema = z
  .string()
  .max(253)
  .regex(
    /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+tinfoil\.containers\.tinfoil\.dev$/,
  );
const modelSchema = z
  .object({
    repo: z.string(),
    enclaves: z.record(
      z
        .object({
          hpke_key: hex32,
          tls_key_fp: hex32,
          predicate: z.enum([
            "https://tinfoil.sh/predicate/sev-snp-guest/v2",
            "https://tinfoil.sh/predicate/tdx-guest/v2",
            "https://tinfoil.sh/predicate/attestation/v3",
          ]),
        })
        .passthrough(),
    ),
    verification: z
      .object({
        observed_at: z.string().datetime({ offset: true }),
        hosts: z.record(
          z
            .object({
              last_success: z.string().datetime({ offset: true }),
              expires_at: z.string().datetime({ offset: true }),
              code_tag: z.string().min(1),
            })
            .passthrough(),
        ),
      })
      .passthrough(),
  })
  .passthrough();

/** Select the caller's exact model from an authenticated router admission snapshot.
 * @param {Uint8Array} bytes - Already decrypted router response.
 * @param {string} modelId - Caller-selected provider-local identity.
 * @returns {TinfoilAdmittedPool} Validated, bounded pool and stable key/release identity digest.
 */
export function parseTinfoilAdmittedPool(
  bytes: Uint8Array,
  modelId: string,
): TinfoilAdmittedPool {
  try {
    const manifest = z
      .object({ models: z.record(z.unknown()) })
      .passthrough()
      .parse(parseTinfoilJSON(bytes));
    if (!Object.hasOwn(manifest.models, modelId)) {
      throw privacyError("PRIVACY_ATTESTATION_FAILED");
    }
    const selected = modelSchema.parse(manifest.models[modelId]);
    const reference = parseTinfoilReference(selected.repo);
    if (reference.repo !== selected.repo || reference.tag || reference.digest) {
      throw privacyError("PRIVACY_ATTESTATION_FAILED");
    }
    const now = Date.now();
    if (
      Math.abs(now - Date.parse(selected.verification.observed_at)) > 300000
    ) {
      throw privacyError("PRIVACY_ATTESTATION_FAILED");
    }
    const entries = Object.entries(selected.enclaves).sort(([a], [b]) =>
      a.localeCompare(b),
    );
    if (!entries.length || entries.length > 16) {
      throw privacyError("PRIVACY_ATTESTATION_FAILED");
    }
    const enclaves = entries.map(([hostname, entry]) => {
      hostSchema.parse(hostname);
      const state = selected.verification.hosts[hostname];
      if (
        !Object.hasOwn(selected.verification.hosts, hostname) ||
        !state ||
        Date.parse(state.expires_at) <= now ||
        Date.parse(state.last_success) > now + 300000
      ) {
        throw privacyError("PRIVACY_ATTESTATION_FAILED");
      }
      const ref = parseTinfoilReference(`${selected.repo}@${state.code_tag}`);
      if (ref.tag !== state.code_tag || ref.digest) {
        throw privacyError("PRIVACY_ATTESTATION_FAILED");
      }
      return Object.freeze({
        hostname,
        hpkeKey: entry.hpke_key,
        tlsKey: entry.tls_key_fp,
        predicate: entry.predicate,
        codeTag: state.code_tag,
        expiresAt: Date.parse(state.expires_at),
      });
    });
    const digest = createHash("sha256")
      .update(
        JSON.stringify({
          repo: selected.repo,
          enclaves: enclaves.map(
            ({ hostname, hpkeKey, tlsKey, predicate, codeTag }) => ({
              hostname,
              hpkeKey,
              tlsKey,
              predicate,
              codeTag,
            }),
          ),
        }),
      )
      .digest("hex");
    return Object.freeze({
      repo: selected.repo,
      enclaves: Object.freeze(enclaves),
      digest,
    });
  } catch {
    throw privacyError("PRIVACY_ATTESTATION_FAILED");
  }
}
