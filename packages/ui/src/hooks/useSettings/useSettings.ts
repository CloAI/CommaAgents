import { useContext } from "react";
import { SettingsContext } from "./useSettings.context";
import type { SettingsContextValue } from "./useSettings.types";

/**
 * Read saved settings and save preferences from within SettingsProvider.
 * @returns {SettingsContextValue} The active settings context.
 */
export function useSettings(): SettingsContextValue {
  const context = useContext(SettingsContext);
  if (!context) {
    throw new Error("useSettings must be used within SettingsProvider.");
  }
  return context;
}
