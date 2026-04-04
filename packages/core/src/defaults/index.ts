// Defaults module barrel — single import point for global defaults.
// Public API is exported from the package index.

// Factories / functions
export {
  getGlobalCredentialStore,
  getGlobalDefaults,
  getGlobalProviderResolver,
  registerProvider,
  resetGlobalDefaults,
  setGlobalCredentialStore,
  unregisterProvider,
} from "./defaults";

// Types
export type { GlobalDefaults, ProviderRegistration } from "./defaults.types";
