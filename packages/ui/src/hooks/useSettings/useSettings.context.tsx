import { createContext, useCallback, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { loadSettings, saveSettings } from "../../settings";
import type { Settings } from "../../settings";
import type { SettingsContextValue } from "./useSettings.types";

export const SettingsContext = createContext<SettingsContextValue | null>(null);

/** Application content that can read and save browser settings. */
export interface SettingsProviderProps {
  /** Components sharing this session's saved settings. */
  readonly children: ReactNode;
}

/**
 * Initialize settings once and expose explicit, failure-aware saves.
 * @param {SettingsProviderProps} props - Application content.
 * @returns {React.ReactElement} The shared settings provider.
 */
export function SettingsProvider({ children }: SettingsProviderProps) {
  const [snapshot, setSnapshot] = useState(loadSettings);
  const handleSave = useCallback((settings: Settings) => {
    const result = saveSettings(settings);
    if (result.type === "success") {
      setSnapshot({ settings: result.settings, notice: null });
    }
    return result;
  }, []);
  const value = useMemo<SettingsContextValue>(
    () => ({ ...snapshot, saveSettings: handleSave }),
    [snapshot, handleSave],
  );
  return (
    <SettingsContext.Provider value={value}>
      {children}
    </SettingsContext.Provider>
  );
}
