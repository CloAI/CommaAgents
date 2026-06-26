import { useContext } from "react";

import { CommandPaletteContext } from "./useCommandPalette.context";
import type { CommandPaletteContextType } from "./useCommandPalette.types";

export function useCommandPalette(): CommandPaletteContextType {
  const contextValue = useContext(CommandPaletteContext);

  if (contextValue === null) {
    throw new Error(
      "useCommandPalette must be used within a CommandPaletteContextProvider",
    );
  }

  return contextValue;
}
