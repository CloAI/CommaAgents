// Stale-file detection contract — shared constants.
//
// File-mutation tools require the LLM to pass `expectedSha256` (or
// `expectedSha256ByPath`) so we can detect concurrent edits between
// the LLM's `read_file` and its follow-up write. When the hashes do
// not match, every tool returns a `stale_file` `ToolError` with the
// *same* `suggestedNextAction` — defined here so the wording stays
// consistent and the LLM can pattern-match on it.

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
