/**
 * Recovery hint returned on every `stale_file` failure. Appended to
 * the tool's LLM-facing `output` by `agent.utils.ts` (because
 * `error.recoverable` is `true`).
 *
 * Wording is deliberately imperative and short — the LLM is asked
 * to perform a specific corrective action, not to "consider" one.
 */
export const STALE_FILE_RECOVERY_HINT =
  "Re-read the file to obtain the current sha256 and re-apply your edit.";
