// Credentials barrel — re-exports store, backend, and types.

export type { JsonFileBackendOptions } from "./backends/json-file";
export { createJsonFileBackend } from "./backends/json-file";
export { createCredentialStore } from "./store";
export type {
  CreateCredentialStoreOptions,
  Credential,
  CredentialBackend,
  CredentialStore,
  CredentialStoreData,
  EnvVarMap,
} from "./types";
export { WELL_KNOWN_ENV_VARS } from "./types";
