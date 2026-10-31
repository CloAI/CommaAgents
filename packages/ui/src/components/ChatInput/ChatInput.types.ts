/** Whether a submitted message was accepted, or why it was not. */
export type SubmitOutcome =
  | { readonly ok: true }
  | { readonly ok: false; readonly message: string };
