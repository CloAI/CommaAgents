// Daemon → Client: provider_unregistered
// Confirmation that a provider was unregistered.

import { z } from "zod";
import { DaemonBase } from "../../shared";

export const ProviderUnregisteredMessage = DaemonBase.extend({
  type: z.literal("provider_unregistered"),
  /** The provider ID that was just unregistered. */
  providerId: z.string(),
});

export type ProviderUnregisteredMessage = z.infer<
  typeof ProviderUnregisteredMessage
>;
