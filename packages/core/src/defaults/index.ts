export {
  getGlobalCredentialStore,
  getGlobalDefaults,
  getGlobalProviderResolver,
  registerProvider,
  resetGlobalDefaults,
  setGlobalCredentialStore,
  setProviderCacheDir,
  unregisterProvider,
} from "./defaults";

// Types
export type { GlobalDefaults, ProviderRegistration } from "./defaults.types";
