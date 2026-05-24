// Daemon → Client: credential_set
// Confirmation that a credential was persisted.

import { z } from "zod";
import { DaemonBase } from "../../shared";

export const CredentialSetMessage = DaemonBase.extend({
  type: z.literal("credential_set"),
  providerId: z.string(),
  credentialType: z.string(),
});

export type CredentialSetMessage = z.infer<typeof CredentialSetMessage>;
