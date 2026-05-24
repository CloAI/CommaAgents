// Client → Daemon: unregister_provider
// Remove a previously registered provider from the runtime resolver.

import { z } from "zod";
import { ClientBase } from "../../shared";

export const UnregisterProviderMessage = ClientBase.extend({
  type: z.literal("unregister_provider"),
  /** Canonical provider ID to unregister (e.g., "openai", "groq"). */
  providerId: z.string().min(1),
});

export type UnregisterProviderMessage = z.infer<
  typeof UnregisterProviderMessage
>;
