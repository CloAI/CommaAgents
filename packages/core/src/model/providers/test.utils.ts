import { createCredentialStore } from "../../credentials/credentials";
import type {
  Credential,
  CredentialStore,
  CredentialStoreData,
} from "../../credentials/credentials.types";
import { listProviderModels, refreshProviderModels } from "./providers";
import type { ModelInfo } from "./providers.types";

/**
 * Build an in-memory credential store holding global credentials only.
 * @param {Readonly<Record<string, Credential>>} [credentials] - Global credentials by provider ID.
 * @returns {CredentialStore} Store that ignores environment variables.
 */
export function createTestCredentialStore(
  credentials: Readonly<Record<string, Credential>> = {},
): CredentialStore {
  let data: CredentialStoreData = { $global: { ...credentials } };
  return createCredentialStore({
    backend: {
      readAll: async () => data,
      writeAll: async (next) => {
        data = next;
      },
    },
    env: {},
  });
}

/**
 * Refresh one provider's own listing with an optional credential, then read its merged models.
 * @param {string} providerId - Provider to refresh.
 * @param {Credential} [credential] - Global credential for that provider.
 * @returns {Promise<readonly ModelInfo[]>} Merged models after the refresh.
 */
export async function refreshAndListProviderModels(
  providerId: string,
  credential?: Credential,
): Promise<readonly ModelInfo[]> {
  await refreshProviderModels(
    createTestCredentialStore(credential ? { [providerId]: credential } : {}),
    { providerId },
  );
  return listProviderModels(providerId);
}
