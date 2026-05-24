// Daemon → Client: provider_registered
// Confirmation that a provider was registered.

import { z } from "zod";
import { DaemonBase } from "../../shared";

export const ProviderRegisteredMessage = DaemonBase.extend({
  type: z.literal("provider_registered"),
  /** The provider ID that was just registered. */
  providerId: z.string(),
});

export type ProviderRegisteredMessage = z.infer<
  typeof ProviderRegisteredMessage
>;
