// Credential store — resolves, gets, sets, and removes credentials.
//
// Resolution priority (most specific wins):
//   1. Strategy-scoped credential (if scope provided and not "$global")
//   2. Environment variable (well-known or custom mapping) → synthesized ApiCredential
//   3. Global-scoped credential ("$global")

import type { Credential } from "../protocol/shared";
import type {
  CreateCredentialStoreOptions,
  CredentialStore,
  CredentialStoreData,
  EnvVarMap,
} from "./types";
import { WELL_KNOWN_ENV_VARS } from "./types";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Merge well-known env vars with user overrides (overrides win). */
function buildEnvVarMap(overrides?: EnvVarMap): EnvVarMap {
  if (!overrides) return { ...WELL_KNOWN_ENV_VARS };
  return { ...WELL_KNOWN_ENV_VARS, ...overrides };
}

/**
 * Try to resolve a credential from environment variables.
 * Returns an `ApiCredential` synthesized from the first matching env var,
 * or `undefined` if none are set.
 */
function resolveFromEnv(
  providerId: string,
  envVarMap: EnvVarMap,
  env: Record<string, string | undefined>,
): Credential | undefined {
  const vars = envVarMap[providerId];
  if (!vars) return undefined;

  for (const varName of vars) {
    const value = env[varName];
    if (value !== undefined && value !== "") {
      return { type: "api", key: value };
    }
  }

  return undefined;
}

// ---------------------------------------------------------------------------
// createCredentialStore()
// ---------------------------------------------------------------------------

/**
 * Create a credential store backed by the given storage backend.
 *
 * The store provides layered credential resolution:
 * 1. Strategy-scoped credential (if `scope` is a strategy name, not `"$global"`)
 * 2. Environment variable (well-known + custom mappings)
 * 3. Global-scoped credential (`"$global"`)
 */
export function createCredentialStore(options: CreateCredentialStoreOptions): CredentialStore {
  const { backend } = options;
  const envVarMap = buildEnvVarMap(options.envVarOverrides);
  const env = options.env ?? process.env;

  return {
    async resolve(providerId: string, scope?: string): Promise<Credential | undefined> {
      const data = await backend.readAll();

      // 1. Strategy-scoped credential
      if (scope && scope !== "$global") {
        const scopedCred = data[scope]?.[providerId];
        if (scopedCred) return scopedCred;
      }

      // 2. Environment variable
      const envCred = resolveFromEnv(providerId, envVarMap, env);
      if (envCred) return envCred;

      // 3. Global-scoped credential
      const globalCred = data["$global"]?.[providerId];
      if (globalCred) return globalCred;

      return undefined;
    },

    async get(providerId: string, scope: string): Promise<Credential | undefined> {
      const data = await backend.readAll();
      return data[scope]?.[providerId];
    },

    async set(providerId: string, scope: string, credential: Credential): Promise<void> {
      const data = await backend.readAll();

      if (!data[scope]) {
        data[scope] = {};
      }
      data[scope][providerId] = credential;

      await backend.writeAll(data);
    },

    async remove(providerId: string, scope: string): Promise<boolean> {
      const data = await backend.readAll();

      if (!data[scope]?.[providerId]) {
        return false;
      }

      delete data[scope][providerId];

      // Clean up empty scopes
      if (Object.keys(data[scope]).length === 0) {
        delete data[scope];
      }

      await backend.writeAll(data);
      return true;
    },

    async list(scope: string): Promise<string[]> {
      const data = await backend.readAll();
      const scopeData = data[scope];
      if (!scopeData) return [];
      return Object.keys(scopeData);
    },

    async listScopes(): Promise<string[]> {
      const data = await backend.readAll();
      return Object.keys(data);
    },
  };
}
