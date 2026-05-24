// Client → Daemon: register_provider
// Register a provider so its models become available in the runtime resolver.

import { z } from "zod";
import { ClientBase } from "../../shared";

export const RegisterProviderMessage = ClientBase.extend({
  type: z.literal("register_provider"),
  /** Canonical provider ID to register (e.g., "openai", "groq"). */
  providerId: z.string().min(1),
});

export type RegisterProviderMessage = z.infer<typeof RegisterProviderMessage>;
