// Client → Daemon: list_providers
// Request a list of known providers with auth status and model catalog.

import { z } from "zod";
import { ClientBase } from "../../shared";

export const ListProvidersMessage = ClientBase.extend({
  type: z.literal("list_providers"),
  /**
   * Optional strategy scope for credential resolution. When provided, the
   * daemon will check strategy-scoped credentials first before falling back
   * to environment variables and the global scope.
   */
  scope: z.string().optional(),
  /**
   * When `true`, the daemon will attempt live model discovery for providers
   * that support it (currently Ollama and GitHub Copilot). Providers without
   * a live lister always return catalog data. Defaults to `false`.
   */
  live: z.boolean().optional(),
});

export type ListProvidersMessage = z.infer<typeof ListProvidersMessage>;
