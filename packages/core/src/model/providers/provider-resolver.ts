import { createOpenAISubscriptionProvider } from "./authentication/openai";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";
import { capitalize } from "@comma-agents/utils";
import type { Credential } from "../../credentials/credentials.types";
import {
  getProviderInstallDirectory,
  setProviderInstallDirectory as setProviderInstallDirectoryPath,
} from "../../defaults/defaults";
import type { ProviderFactory, ProviderResolver } from "../model.types";
import {
  getProviderPackageNameSync,
  getRegisteredProviderSync,
  resetProviderRegistry,
} from "./providers";
import type { ProviderDefinition } from "./providers.types";

// -- Module state --

/** Guards against duplicate concurrent installs of the same package. */
const installLocks = new Map<string, Promise<void>>();

// -- Provider cache directory --

/**
 * Set the directory where provider npm packages are auto-installed.
 *
 * When set, `resolveViaPackage()` will attempt to install missing provider
 * packages into this directory (using `bun add`) before falling back to
 * the standard module resolution. Pass `undefined` to disable auto-install.
 *
 * The daemon calls this on startup with its configured `providerInstallDirectory`.
 *
 * @example
 * ```ts
 * setProviderInstallDirectory("/Users/bot/.comma/providers");
 * ```
 */
export function setProviderInstallDirectory(directory: string): void {
  setProviderInstallDirectoryPath(directory);
  installLocks.clear();
}

// -- Provider cache helpers --

function ensureCacheDir(dir: string): void {
  mkdirSync(dir, { recursive: true });
  const pkgJsonPath = join(dir, "package.json");
  if (!existsSync(pkgJsonPath)) {
    writeFileSync(
      pkgJsonPath,
      JSON.stringify({ name: "comma-providers", private: true }, null, 2),
    );
  }
}

function requireFromCache(
  cacheDir: string,
  packageName: string,
): Record<string, unknown> {
  const _require = createRequire(join(cacheDir, "package.json"));
  return _require(packageName) as Record<string, unknown>;
}

function isPackageCached(cacheDir: string, packageName: string): boolean {
  const parts = packageName.split("/");
  const pkgJsonPath = join(cacheDir, "node_modules", ...parts, "package.json");
  return existsSync(pkgJsonPath);
}

async function ensurePackageInCache(
  directory: string,
  packageName: string,
): Promise<void> {
  if (installLocks.has(packageName)) {
    return installLocks.get(packageName)!;
  }

  const promise = (async () => {
    ensureCacheDir(directory);

    if (isPackageCached(directory, packageName)) return;

    const result = Bun.spawnSync(["bun", "add", packageName], {
      cwd: directory,
      stdio: ["ignore", "pipe", "pipe"],
    });

    if (result.exitCode !== 0) {
      const stderr = new TextDecoder().decode(result.stderr);
      throw new Error(
        `Failed to install ${packageName} into provider cache: ${stderr.trim()}`,
      );
    }
  })();

  installLocks.set(packageName, promise);
  try {
    await promise;
  } finally {
    installLocks.delete(packageName);
  }
}

async function tryImportFromCache(
  packageName: string,
  importError: unknown,
): Promise<Record<string, unknown>> {
  const providerInstallDirectory = getProviderInstallDirectory();
  if (!providerInstallDirectory) throw importError;

  await ensurePackageInCache(providerInstallDirectory, packageName);
  return requireFromCache(providerInstallDirectory, packageName);
}

// -- Provider resolver --

function findCreateExport(module: Record<string, unknown>): unknown {
  for (const key of Object.keys(module)) {
    if (
      key.startsWith("create") &&
      typeof module[key] === "function" &&
      key !== "createRequire" &&
      key !== "createImport" &&
      key !== "createRequirePTY"
    ) {
      return module[key];
    }
  }
  return undefined;
}

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
  registration: ProviderDefinition,
): Promise<ProviderFactory> {
  if (registration.origin === "user" && registration.baseURL) {
    const { createOpenAICompatible } =
      await import("@ai-sdk/openai-compatible");
    return createOpenAICompatible({
      name: registration.id,
      baseURL: registration.baseURL,
      ...(registration.credentialType === "api"
        ? { apiKey: extractApiKey(credential) }
        : {}),
    });
  }
  // 1. Direct factory takes precedence
  if (registration.factory) {
    return await registration.factory(credential);
  }

  // 2. Package-based resolution
  const packageName = registration.packageName ?? `@ai-sdk/${providerId}`;
  const factoryName =
    registration.factoryName ?? `create${capitalize(providerId)}`;

  return await resolveViaPackage(
    providerId,
    credential,
    packageName,
    factoryName,
  );
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
    providerModule = (await import(packageName)) as Record<string, unknown>;
  } catch (importError) {
    if (getProviderInstallDirectory()) {
      try {
        providerModule = await tryImportFromCache(packageName, importError);
      } catch (cacheError) {
        throw new Error(
          `Failed to load provider package "${packageName}" for provider "${providerId}". ` +
            `Original error: ${cacheError instanceof Error ? cacheError.message : String(cacheError)}`,
        );
      }
    } else {
      throw new Error(
        `Failed to load provider package "${packageName}" for provider "${providerId}". ` +
          `Install it with: bun add ${packageName}\n` +
          `Original error: ${importError instanceof Error ? importError.message : String(importError)}`,
      );
    }
  }

  const factory = (providerModule[factoryName] ??
    providerModule.default ??
    findCreateExport(providerModule)) as
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
    throw new Error(
      `${packageName}.${factoryName}() did not return a callable provider function`,
    );
  }

  return provider as ProviderFactory;
}

/**
 * Build a GitHub Copilot provider using @ai-sdk/openai-compatible.
 */
async function resolveCopilotProvider(
  credential: Credential,
): Promise<ProviderFactory> {
  const apiKey = extractApiKey(credential);
  if (!apiKey) {
    throw new Error(
      "No GitHub Copilot token available. " +
        "Set GITHUB_TOKEN or save credentials via the TUI.",
    );
  }

  const packageName = "@ai-sdk/openai-compatible";
  let providerModule: Record<string, unknown>;
  try {
    providerModule = (await import(packageName)) as Record<string, unknown>;
  } catch (importError) {
    if (getProviderInstallDirectory()) {
      providerModule = await tryImportFromCache(packageName, importError);
    } else {
      throw new Error(
        `Failed to load ${packageName}. Install it with: bun add ${packageName}\n` +
          `Original error: ${importError instanceof Error ? importError.message : String(importError)}`,
      );
    }
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
    throw new Error(
      "createOpenAICompatible() did not return a callable provider function",
    );
  }

  return provider as ProviderFactory;
}

/**
 * Get the global provider resolver.
 *
 * The resolver uses this resolution order for each provider ID:
 * 1. Registered definition with direct `factory` (via `registerProviderDefinition()`)
 * 2. Registered definition with `packageName`/`factoryName`
 * 3. Special handling for `github-copilot` (uses `@ai-sdk/openai-compatible`)
 * 4. models.dev catalog + built-in overrides (ollama, deepseek) — sync lookup
 * 5. Last resort: attempt `@ai-sdk/<providerId>` as a guess
 *
 * Step 1 is a synchronous, network-free registry lookup — it never blocks
 * on the async models.dev catalog fetch, so model resolution stays fast
 * even on a cold start.
 *
 * @example
 * ```ts
 * const resolver = getGlobalProviderResolver();
 * const factory = await resolver("openai", credential);
 * const model = factory("gpt-4o");
 * ```
 */
export function getGlobalProviderResolver(): ProviderResolver {
  return async (
    providerId: string,
    credential: Credential,
  ): Promise<ProviderFactory> => {
    // Explicit programmatic registrations retain precedence over built-in adapters.
    const registration = getRegisteredProviderSync(providerId);
    if (
      providerId === "openai" &&
      credential.type === "oauth" &&
      registration?.origin !== "registered" &&
      registration?.origin !== "user"
    )
      return createOpenAISubscriptionProvider(credential);
    // 1. Check registered provider definitions (sync, no catalog fetch)
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
      return await resolveViaPackage(
        providerId,
        credential,
        knownPackage,
        factoryName,
      );
    }

    // 4. Last resort: guess @ai-sdk/<providerId>
    const guessedPackage = `@ai-sdk/${providerId}`;
    const factoryName = `create${capitalize(providerId)}`;
    return await resolveViaPackage(
      providerId,
      credential,
      guessedPackage,
      factoryName,
    );
  };
}

/** Reset process-wide provider resolution state. Intended for tests and process reset. */
export function resetGlobalProviderResolver(): void {
  resetProviderRegistry();
  installLocks.clear();
}
