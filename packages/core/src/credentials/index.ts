export { createJsonFileBackend } from "./backends/json-file";
export { createCredentialStore } from "./credentials";

export type {
  ApiCredential,
  Credential,
  CustomCredential,
  OAuthCredential,
} from "./credentials.schema";
export {
  ApiCredentialSchema,
  CredentialSchema,
  CustomCredentialSchema,
  OAuthCredentialSchema,
} from "./credentials.schema";
export type {
  AuthStatus,
  CreateCredentialStoreOptions,
  CredentialBackend,
  CredentialStore,
  CredentialStoreData,
  EnvVarMap,
} from "./credentials.types";
export { resolveCredentialsPath } from "./credentials.utils";
