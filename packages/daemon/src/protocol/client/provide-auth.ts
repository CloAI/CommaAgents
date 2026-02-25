// Client → Daemon: provide_auth
// Provide a credential for a provider that requested authentication.

import { z } from "zod";
import { ClientBase, CredentialSchema } from "../shared";

export const ProvideAuthMessage = ClientBase.extend({
  type: z.literal("provide_auth"),
  /** The provider ID that needs authentication. */
  providerId: z.string().min(1),
  /** The credential to use (API key, OAuth tokens, or custom). */
  credential: CredentialSchema,
  /** Scope for the credential: strategy name or "$global". */
  scope: z.string().min(1).default("$global"),
  /** Whether to persist this credential for future sessions. */
  persist: z.boolean(),
});

export type ProvideAuthMessage = z.infer<typeof ProvideAuthMessage>;
