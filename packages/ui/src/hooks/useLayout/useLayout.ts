import { useContext } from "react";
import { LayoutContext } from "./useLayout.context";
import type { LayoutContextValue } from "./useLayout.types";

/**
 * Read the workspace layout and change it from within LayoutProvider.
 * @returns {LayoutContextValue} The shared layout state and operations.
 */
export function useLayout(): LayoutContextValue {
  const context = useContext(LayoutContext);
  if (!context)
    throw new Error("useLayout must be used within LayoutProvider.");
  return context;
}
