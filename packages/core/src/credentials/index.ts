// Credentials barrel — re-exports store, backend, types, utils, and schemas.

export type { JsonFileBackendOptions } from "./backends/json-file";
// Factories
export { createJsonFileBackend } from "./backends/json-file";
export { createCredentialStore } from "./credentials";
// Types
export type {
  ApiCredential,
  Credential,
  CustomCredential,
  OAuthCredential,
} from "./credentials.schema";
// Schemas
export {
  ApiCredentialSchema,
  CredentialSchema,
  CustomCredentialSchema,
  OAuthCredentialSchema,
} from "./credentials.schema";
export type {
  CreateCredentialStoreOptions,
  CredentialBackend,
  CredentialStore,
  CredentialStoreData,
  EnvVarMap,
} from "./credentials.types";
export { WELL_KNOWN_ENV_VARS } from "./credentials.types";
// Utils
export { resolveCredentialsPath, resolveDataDir } from "./credentials.utils";
