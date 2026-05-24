// Client → Daemon: set_credential
// Persist a credential for a provider.

import { z } from "zod";
import { ClientBase } from "../../shared";

export const ApiCredentialPayload = z.object({
  type: z.literal("api"),
  key: z.string().min(1),
});

export const SetCredentialMessage = ClientBase.extend({
  type: z.literal("set_credential"),
  providerId: z.string().min(1),
  credentialType: z.enum(["api", "oauth", "custom"]),
  apiKey: z.string().min(1).optional(),
  oauthToken: z.string().min(1).optional(),
  customData: z.record(z.unknown()).optional(),
});

export type SetCredentialMessage = z.infer<typeof SetCredentialMessage>;
