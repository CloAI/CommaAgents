import type React from "react";
import { createContext, useCallback, useMemo, useState } from "react";

import type {
  UserConfig,
  UserConfigContextProviderProps,
  UserConfigContextType,
} from "./useUserConfig.types";
import {
  loadUserConfig,
  resolveDefaultConfigFilePath,
  saveUserConfig,
} from "./useUserConfig.utils";

export const UserConfigContext = createContext<UserConfigContextType | null>(
  null,
);

/**
 * Loads the persisted user config synchronously on first render so the
 * initial paint already uses the correct theme. Subsequent updates flush
 * to disk asynchronously via `setConfig` / `updateConfig`.
 */
export function UserConfigContextProvider({
  configFilePath: configFilePathProp,
  children,
}: UserConfigContextProviderProps): React.ReactElement {
  const configFilePath = useMemo(
    () => configFilePathProp ?? resolveDefaultConfigFilePath(),
    [configFilePathProp],
  );

  const [config, setConfigState] = useState<UserConfig>(() =>
    loadUserConfig(configFilePath),
  );

  const setConfig = useCallback(
    (next: UserConfig): void => {
      setConfigState(next);
      // Defer disk write so it never blocks the React commit phase.
      queueMicrotask(() => saveUserConfig(configFilePath, next));
    },
    [configFilePath],
  );

  const updateConfig = useCallback(
    (patch: Partial<UserConfig>): void => {
      setConfigState((previous) => {
        const next: UserConfig = { ...previous, ...patch };
        queueMicrotask(() => saveUserConfig(configFilePath, next));
        return next;
      });
    },
    [configFilePath],
  );

  const contextValue = useMemo<UserConfigContextType>(
    () => ({ config, setConfig, updateConfig, configFilePath }),
    [config, setConfig, updateConfig, configFilePath],
  );

  return (
    <UserConfigContext.Provider value={contextValue}>
      {children}
    </UserConfigContext.Provider>
  );
}
