import type { PrivacyLimits } from "./privacy.types";

export const DEFAULT_PRIVACY_LIMITS: PrivacyLimits = {
  requestTimeoutMs: 120_000,
  verificationTimeoutMs: 15_000,
  maxEvidenceBytes: 2 * 1024 * 1024,
  maxWireBytes: 64 * 1024 * 1024,
  maxPlaintextBytes: 16 * 1024 * 1024,
};
export const DEFAULT_PCCS_URL =
  "https://pccs.phala.network/sgx/certification/v4/";
export const DEFAULT_NRAS_URL =
  "https://nras.attestation.nvidia.com/v4/attest/gpu";
