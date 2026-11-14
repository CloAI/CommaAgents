export const DEFAULT_PCCS_URL =
  "https://pccs.phala.network/sgx/certification/v4/";
export const DEFAULT_NRAS_URL =
  "https://nras.attestation.nvidia.com/v4/attest/gpu";

/** Public protocol metadata approved for Venice request diagnostics. */
export const VENICE_VISIBLE_HEADERS = new Set([
  "x-venice-tee-client-pub-key",
  "x-venice-tee-model-pub-key",
  "x-venice-tee-signing-algo",
]);
export const VENICE_VISIBLE_QUERY_PARAMS = new Set([
  "model",
  "nonce",
  "request_id",
]);

/** Public Intel collateral selectors, without evidence or credentials. */
export const VERIFICATION_VISIBLE_QUERY_PARAMS = new Set([
  "fmspc",
  "ca",
  "encoding",
  "update",
]);
