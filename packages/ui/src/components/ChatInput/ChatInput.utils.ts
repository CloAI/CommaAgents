import type { SubmitOutcome } from "./ChatInput.types";

/** An accepted submission. */
export const SUBMITTED: SubmitOutcome = { ok: true };

/**
 * Describe a settled request as a submission outcome.
 * @param {{ ok: true } | { ok: false; error: { message: string } }} result - Settled request.
 * @returns {SubmitOutcome} Accepted, or rejected with the failure's message.
 */
export function submitOutcome(
  result:
    | { readonly ok: true }
    | { readonly ok: false; readonly error: { readonly message: string } },
): SubmitOutcome {
  return result.ok ? SUBMITTED : { ok: false, message: result.error.message };
}
