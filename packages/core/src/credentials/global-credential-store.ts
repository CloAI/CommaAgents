import { getCredentialsPath } from "../defaults/defaults";
import { createJsonFileCredentialBackend } from "./backends/json-file";
import { createCredentialStore } from "./credentials";
import type { CredentialStore } from "./credentials.types";

let defaultCredentialStore: CredentialStore | undefined;
let customCredentialStore: CredentialStore | undefined;

/** Return the process-wide credential store, creating its file backend on demand. */
export function getGlobalCredentialStore(): CredentialStore {
  if (customCredentialStore) return customCredentialStore;

  defaultCredentialStore ??= createCredentialStore({
    backend: createJsonFileCredentialBackend({
      filePath: getCredentialsPath(),
    }),
  });
  return defaultCredentialStore;
}

/** Override the process-wide credential store. Pass `undefined` to use the file backend. */
export function setGlobalCredentialStore(
  store: CredentialStore | undefined,
): void {
  customCredentialStore = store;
}

/** Clear process-wide credential-store state. Intended for tests and process reset. */
export function resetGlobalCredentialStore(): void {
  customCredentialStore = undefined;
  defaultCredentialStore = undefined;
}
