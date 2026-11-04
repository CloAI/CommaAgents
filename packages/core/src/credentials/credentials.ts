// Credential store — resolves, gets, sets, and removes credentials.
//
// Resolution priority (most specific wins):
//   1. Strategy-scoped credential (if scope provided and not "$global")
//   2. Environment variable (well-known or custom mapping) → synthesized ApiCredential
//   3. Global-scoped credential ("$global")

import { WELL_KNOWN_ENV_VARS } from "./credentials.constants";
import type { Credential } from "./credentials.schema";
import type {
  AuthStatus,
  CreateCredentialStoreOptions,
  CredentialStore,
  CredentialSource,
  CredentialStoreData,
  EnvVarMap,
} from "./credentials.types";

// Helpers

/**
 * Merge well-known env vars with user overrides (overrides win).
 * @param {EnvVarMap} overrides - Provider environment mappings that replace defaults.
 * @returns {EnvVarMap} The combined provider environment mappings.
 */
function buildEnvVarMap(overrides?: EnvVarMap): EnvVarMap {
  if (!overrides) {
    return { ...WELL_KNOWN_ENV_VARS };
  }
  return { ...WELL_KNOWN_ENV_VARS, ...overrides };
}

/**
 * Try to resolve a credential from environment variables.
 * Returns an `ApiCredential` synthesized from the first matching env var,
 * or `undefined` if none are set.
 * @param {string} providerId - Provider whose environment credentials are inspected.
 * @param {EnvVarMap} envVarMap - Ordered variable aliases for each provider.
 * @param {Readonly<Record<string, string | undefined>>} env - Environment values available to this store.
 * @returns {Credential | undefined} The first configured API credential, or undefined.
 */
function resolveFromEnv(
  providerId: string,
  envVarMap: EnvVarMap,
  env: Readonly<Record<string, string | undefined>>,
): Credential | undefined {
  const vars = envVarMap[providerId];
  if (!vars) {
    return undefined;
  }

  for (const varName of vars) {
    const value = env[varName];
    if (value !== undefined && value !== "") {
      return { type: "api", key: value };
    }
  }

  return undefined;
}

/**
 * Create a credential store backed by the given storage backend.
 *
 * The store provides layered credential resolution:
 * 1. Strategy-scoped credential (if `scope` is a strategy name, not `"$global"`)
 * 2. Environment variable (well-known + custom mappings)
 * 3. Global-scoped credential (`"$global"`)
 *
 * Mutations are serialized within this store instance; separate instances or
 * processes sharing a backend must coordinate their own writes.
 *
 * @param {CreateCredentialStoreOptions} options - Backend and environment resolution options.
 * @returns {CredentialStore} A scoped credential store with ordered mutations.
 * @example
 * ```ts
 * const store = createCredentialStore({
 *   backend: createJsonFileCredentialBackend({ filePath: "/path/to/credentials.json" }),
 * });
 * const credential = await store.resolve("openai", "my-strategy");
 * ```
 */
export function createCredentialStore(
  options: CreateCredentialStoreOptions,
): CredentialStore {
  const { backend } = options;
  const envVarMap = buildEnvVarMap(options.envVarOverrides);
  const env = options.env ?? process.env;
  let mutationQueue = Promise.resolve();

  function enqueueMutation<Result>(
    operation: () => Promise<Result>,
  ): Promise<Result> {
    const result = mutationQueue.then(operation);
    mutationQueue = result.then(
      () => {},
      () => {},
    );
    return result;
  }

  async function readAll() {
    try {
      return await backend.readAll();
    } catch {
      throw Object.assign(new Error("Unable to read credential storage."), {
        code: "CREDENTIAL_STORAGE_ERROR",
      });
    }
  }

  async function writeAll(data: CredentialStoreData) {
    try {
      await backend.writeAll(data);
    } catch {
      throw Object.assign(new Error("Unable to write credential storage."), {
        code: "CREDENTIAL_STORAGE_ERROR",
      });
    }
  }

  async function resolve(
    providerId: string,
    scope?: string,
  ): Promise<Credential | undefined> {
    const data = await readAll();

    // 1. Strategy-scoped credential
    if (scope && scope !== "$global") {
      const scopedCred = data[scope]?.[providerId];
      if (scopedCred) {
        return scopedCred;
      }
    }

    // 2. Environment variable
    const envCred = resolveFromEnv(providerId, envVarMap, env);
    if (envCred) {
      return envCred;
    }

    // 3. Global-scoped credential
    const globalCred = data.$global?.[providerId];
    if (globalCred) {
      return globalCred;
    }

    return undefined;
  }

  return {
    resolve,

    async getSource(providerId: string): Promise<CredentialSource> {
      const data = await readAll();
      if (resolveFromEnv(providerId, envVarMap, env)) {
        return "environment";
      }
      return data.$global?.[providerId] ? "global" : "none";
    },

    async get(
      providerId: string,
      scope: string,
    ): Promise<Credential | undefined> {
      const data = await readAll();
      return data[scope]?.[providerId];
    },

    async set(
      providerId: string,
      scope: string,
      credential: Credential,
      expected?: Credential | null,
    ): Promise<void> {
      return enqueueMutation(async () => {
        const data = await readAll();
        if (
          expected !== undefined &&
          JSON.stringify(data[scope]?.[providerId] ?? null) !==
            JSON.stringify(expected)
        ) {
          throw Object.assign(
            new Error("Credential changed before it could be updated."),
            { code: "CREDENTIAL_CHANGED" },
          );
        }

        // Create a mutable copy for modification
        const mutableData: Record<string, Record<string, Credential>> = {
          ...data,
        };

        mutableData[scope] = { ...data[scope], [providerId]: credential };

        await writeAll(mutableData);
      });
    },

    async remove(providerId: string, scope: string): Promise<boolean> {
      return enqueueMutation(async () => {
        const data = await readAll();

        if (!data[scope]?.[providerId]) {
          return false;
        }

        // Create a mutable copy for modification
        const mutableData: Record<string, Record<string, Credential>> = {
          ...data,
        };
        mutableData[scope] = { ...mutableData[scope] };

        delete mutableData[scope][providerId];

        // Clean up empty scopes
        if (Object.keys(mutableData[scope]).length === 0) {
          delete mutableData[scope];
        }

        await writeAll(mutableData);
        return true;
      });
    },

    async list(scope: string): Promise<string[]> {
      const data = await readAll();
      const scopeData = data[scope];
      if (!scopeData) {
        return [];
      }
      return Object.keys(scopeData);
    },

    async listScopes(): Promise<string[]> {
      const data = await readAll();
      return Object.keys(data);
    },

    async getAuthStatus(
      providerId: string,
      scope?: string,
    ): Promise<AuthStatus> {
      const credential = await resolve(providerId, scope);
      return credential ? "configured" : "none";
    },
  };
}
