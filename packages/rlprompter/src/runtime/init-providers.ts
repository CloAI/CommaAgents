// initProviders — configure the global credential store and restore any
// providers the user previously registered (via the daemon / TUI). rlprompter
// runs strategies in-process, so it must populate the same global registries
// the daemon would, otherwise LLM agents cannot resolve a model.
//
// Reads the shared platform data dir: `credentials.json` for keys and
// `provider-registry.json` for the list of registered provider ids — the exact
// files the daemon writes, so configuration is shared across both tools.

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import {
  createCredentialStore,
  createJsonFileBackend,
  getProviderDefinition,
  registerProvider,
  registerProviderDefinition,
  resolveDataDir,
  setGlobalCredentialStore,
} from "@comma-agents/core";

/** Read the daemon-written list of registered provider ids, if present. */
function loadRegisteredProviderIds(): string[] {
  try {
    const filePath = join(resolveDataDir(), "provider-registry.json");
    if (!existsSync(filePath)) return [];
    const parsed: unknown = JSON.parse(readFileSync(filePath, "utf-8"));
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (item): item is string => typeof item === "string" && item.length > 0,
    );
  } catch {
    return [];
  }
}

/**
 * Initialize global credential + provider registries. Safe to call once at
 * startup. Returns the number of providers restored.
 */
export async function initProviders(): Promise<number> {
  const dataDir = resolveDataDir();
  const credentialStore = createCredentialStore({
    backend: createJsonFileBackend({
      filePath: join(dataDir, "credentials.json"),
    }),
  });
  setGlobalCredentialStore(credentialStore);

  let restored = 0;
  for (const providerId of loadRegisteredProviderIds()) {
    try {
      const definition = await getProviderDefinition(providerId);
      if (!definition) continue;
      registerProviderDefinition(definition);
      registerProvider(providerId, {
        packageName: definition.packageName ?? `@ai-sdk/${providerId}`,
      });
      restored++;
    } catch {
      // Provider package may be unavailable — skip silently.
    }
  }
  return restored;
}
