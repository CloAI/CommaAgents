// Global defaults — singleton credential store, provider registry, and resolver.
//
// Provides sensible defaults so that loadStrategy() and loadAgent() work
// with zero configuration when credentials are stored on disk and provider
// packages are installed (or auto-installed via Bun).
//
// All state is module-scoped. Use setGlobalCredentialStore() to override
// the credential store, registerProvider() to extend the resolver, and
// resetGlobalDefaults() to restore initial state (primarily for tests).

import { capitalize } from "@comma-agents/utils";
import { createJsonFileBackend } from "../credentials/backends/json-file";
import { createCredentialStore } from "../credentials/credentials";
import type { Credential, CredentialStore } from "../credentials/credentials.types";
import { resolveCredentialsPath } from "../credentials/credentials.utils";
import type { ProviderFactory, ProviderResolver } from "../model/model.types";
import { getProviderPackageNameSync } from "../model/providers/index";
import type { GlobalDefaults, ProviderRegistration } from "./defaults.types";

// -- Module state --

/** Custom provider registrations (user-registered, not built-in). */
let providerRegistry = new Map<string, ProviderRegistration>();

/** Overridden global credential store (undefined = use lazy default). */
let customCredentialStore: CredentialStore | undefined;

/** Lazily-created default credential store instance. */
let defaultCredentialStore: CredentialStore | undefined;

// -- Credential store --

/**
 * Get the global credential store.
 *
 * If no custom store has been set via `setGlobalCredentialStore()`, a default
 * store is lazily created using the platform-aware credentials file path.
 *
 * @example
 * ```ts
 * const store = getGlobalCredentialStore();
 * const credential = await store.resolve("openai");
 * ```
 */
export function getGlobalCredentialStore(): CredentialStore {
  if (customCredentialStore) {
    return customCredentialStore;
  }

  if (!defaultCredentialStore) {
    defaultCredentialStore = createCredentialStore({
      backend: createJsonFileBackend({ filePath: resolveCredentialsPath() }),
    });
  }

  return defaultCredentialStore;
}

/**
 * Override the global credential store.
 *
 * All subsequent calls to `getGlobalCredentialStore()` (and any
 * `loadStrategy()` / `loadAgent()` calls that rely on global defaults)
 * will use this store instead of the platform-default file store.
 *
 * Pass `undefined` to revert to the default store.
 *
 * @example
 * ```ts
 * setGlobalCredentialStore(myCustomStore);
 * ```
 */
export function setGlobalCredentialStore(store: CredentialStore | undefined): void {
  customCredentialStore = store;
}

// -- Provider registry --

/**
 * Register a custom provider with the global resolver.
 *
 * Registered providers take precedence over the models.dev catalog
 * map and the default `@ai-sdk/<providerId>` dynamic import convention.
 *
 * @example
 * ```ts
 * import { registerProvider } from "@comma-agents/core";
 *
 * // Direct factory — full control over provider creation
 * registerProvider("my-custom-llm", {
 *   factory: (credential) => {
 *     const apiKey = credential.type === "api" ? credential.key : undefined;
 *     return (modelId) => myProvider({ apiKey, model: modelId });
 *   },
 * });
 *
 * // Package-based — dynamic import with custom export name
 * registerProvider("deepinfra", {
 *   packageName: "@deepinfra/ai-sdk",
 *   factoryName: "createDeepInfra",
 * });
 * ```
 */
export function registerProvider(providerId: string, registration: ProviderRegistration): void {
  providerRegistry.set(providerId, registration);
}

/**
 * Remove a previously registered custom provider.
 * Returns `true` if the provider was registered and removed.
 */
export function unregisterProvider(providerId: string): boolean {
  return providerRegistry.delete(providerId);
}

// -- Provider resolver --

/**
 * Extract an API key string from a credential.
 *
 * Maps credential types to usable key strings:
 * - `api`   -> `credential.key`
 * - `oauth` -> `credential.accessToken`
 * - `custom` -> `undefined`
 */
function extractApiKey(credential: Credential): string | undefined {
  if (credential.type === "api") return credential.key;
  if (credential.type === "oauth") return credential.accessToken;
  return undefined;
}

/**
 * Build provider options from a credential for AI SDK provider factories.
 */
function buildProviderOptions(credential: Credential): Record<string, unknown> {
  if (credential.type === "api") {
    return { apiKey: credential.key };
  }
  if (credential.type === "oauth") {
    return { apiKey: credential.accessToken };
  }
  if (credential.type === "custom") {
    return { ...credential.data };
  }
  return {};
}

/**
 * Resolve a provider via custom registration (direct factory or package-based).
 */
async function resolveViaRegistration(
  providerId: string,
  credential: Credential,
  registration: ProviderRegistration,
): Promise<ProviderFactory> {
  // 1. Direct factory takes precedence
  if (registration.factory) {
    return await registration.factory(credential);
  }

  // 2. Package-based resolution
  const packageName = registration.packageName ?? `@ai-sdk/${providerId}`;
  const factoryName = registration.factoryName ?? `create${capitalize(providerId)}`;

  return await resolveViaPackage(providerId, credential, packageName, factoryName);
}

/**
 * Resolve a provider by dynamically importing a package.
 */
async function resolveViaPackage(
  providerId: string,
  credential: Credential,
  packageName: string,
  factoryName: string,
): Promise<ProviderFactory> {
  let providerModule: Record<string, unknown>;
  try {
    providerModule = await import(packageName);
  } catch (importError) {
    throw new Error(
      `Failed to load provider package "${packageName}" for provider "${providerId}". ` +
        `Install it with: bun add ${packageName}\n` +
        `Original error: ${importError instanceof Error ? importError.message : String(importError)}`,
    );
  }

  const factory = (providerModule[factoryName] ?? providerModule.default) as
    | ((options: Record<string, unknown>) => unknown)
    | undefined;

  if (typeof factory !== "function") {
    throw new Error(
      `Package "${packageName}" does not export "${factoryName}" or a default function. ` +
        `Available exports: [${Object.keys(providerModule).join(", ")}]`,
    );
  }

  const providerOptions = buildProviderOptions(credential);
  const provider = factory(providerOptions);

  if (typeof provider !== "function") {
    throw new Error(`${packageName}.${factoryName}() did not return a callable provider function`);
  }

  return provider as ProviderFactory;
}

/**
 * Build a GitHub Copilot provider using @ai-sdk/openai-compatible.
 */
async function resolveCopilotProvider(credential: Credential): Promise<ProviderFactory> {
  const apiKey = extractApiKey(credential);
  if (!apiKey) {
    throw new Error(
      "No GitHub Copilot token available. " + "Set GITHUB_TOKEN or save credentials via the TUI.",
    );
  }

  const packageName = "@ai-sdk/openai-compatible";
  let providerModule: Record<string, unknown>;
  try {
    providerModule = await import(packageName);
  } catch (importError) {
    throw new Error(
      `Failed to load ${packageName}. Install it with: bun add ${packageName}\n` +
        `Original error: ${importError instanceof Error ? importError.message : String(importError)}`,
    );
  }

  const createOpenAICompatible = providerModule.createOpenAICompatible as
    | ((config: Record<string, unknown>) => unknown)
    | undefined;

  if (typeof createOpenAICompatible !== "function") {
    throw new Error(
      `${packageName} does not export "createOpenAICompatible". ` +
        `Available exports: [${Object.keys(providerModule).join(", ")}]`,
    );
  }

  const provider = createOpenAICompatible({
    name: "github-copilot",
    baseURL: "https://api.githubcopilot.com",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Openai-Intent": "conversation-edits",
    },
  });

  if (typeof provider !== "function") {
    throw new Error("createOpenAICompatible() did not return a callable provider function");
  }

  return provider as ProviderFactory;
}

/**
 * Get the global provider resolver.
 *
 * The resolver uses this resolution order for each provider ID:
 * 1. Custom registration with direct `factory` (via `registerProvider()`)
 * 2. Custom registration with `packageName`/`factoryName`
 * 3. Special handling for `github-copilot` (uses `@ai-sdk/openai-compatible`)
 * 4. models.dev catalog + built-in overrides (ollama, deepseek) — sync lookup
 * 5. Last resort: attempt `@ai-sdk/<providerId>` as a guess
 *
 * @example
 * ```ts
 * const resolver = getGlobalProviderResolver();
 * const factory = await resolver("openai", credential);
 * const model = factory("gpt-4o");
 * ```
 */
export function getGlobalProviderResolver(): ProviderResolver {
  return async (providerId: string, credential: Credential): Promise<ProviderFactory> => {
    // 1. Check custom registry
    const registration = providerRegistry.get(providerId);
    if (registration) {
      return await resolveViaRegistration(providerId, credential, registration);
    }

    // 2. Special-case: GitHub Copilot
    if (providerId === "github-copilot") {
      return await resolveCopilotProvider(credential);
    }

    // 3. Catalog + built-in overrides
    const knownPackage = getProviderPackageNameSync(providerId);
    if (knownPackage) {
      const factoryName = `create${capitalize(providerId)}`;
      return await resolveViaPackage(providerId, credential, knownPackage, factoryName);
    }

    // 4. Last resort: guess @ai-sdk/<providerId>
    const guessedPackage = `@ai-sdk/${providerId}`;
    const factoryName = `create${capitalize(providerId)}`;
    return await resolveViaPackage(providerId, credential, guessedPackage, factoryName);
  };
}

// -- Inspection and reset --

/**
 * Get a snapshot of the current global defaults state.
 *
 * Useful for inspection and testing.
 */
export function getGlobalDefaults(): GlobalDefaults {
  return {
    credentialStore: getGlobalCredentialStore(),
    providerResolver: getGlobalProviderResolver(),
    registeredProviderIds: [...providerRegistry.keys()],
  };
}

/**
 * Reset all global defaults to initial state.
 *
 * Clears the provider registry, removes the custom credential store,
 * and discards the lazily-created default store. Primarily for tests.
 */
export function resetGlobalDefaults(): void {
  providerRegistry = new Map();
  customCredentialStore = undefined;
  defaultCredentialStore = undefined;
}
