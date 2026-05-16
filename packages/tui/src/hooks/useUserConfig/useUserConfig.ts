import { useContext } from "react";

import { UserConfigContext } from "./useUserConfig.context";
import type { UserConfigContextType } from "./useUserConfig.types";

/**
 * Access the current user configuration and mutators.
 *
 * Must be called from within a `<UserConfigContextProvider>`. Throws when
 * no provider is present so a missing wiring fails loudly at the call site
 * rather than surfacing as a confusing `undefined` deeper in rendering.
 */
export function useUserConfig(): UserConfigContextType {
  const contextValue = useContext(UserConfigContext);

  if (contextValue === null) {
    throw new Error(
      "useUserConfig must be used within a UserConfigContextProvider",
    );
  }

  return contextValue;
}
