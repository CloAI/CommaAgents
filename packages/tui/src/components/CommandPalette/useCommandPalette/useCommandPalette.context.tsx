import type React from "react";
import { createContext, useMemo } from "react";

import type {
  CommandPaletteContextProviderProps,
  CommandPaletteContextType,
} from "./useCommandPalette.types";

export const CommandPaletteContext =
  createContext<CommandPaletteContextType | null>(null);

export function CommandPaletteContextProvider({
  closePalette,
  children,
}: CommandPaletteContextProviderProps): React.ReactElement {
  const contextValue = useMemo<CommandPaletteContextType>(
    () => ({ closePalette }),
    [closePalette],
  );

  return (
    <CommandPaletteContext.Provider value={contextValue}>
      {children}
    </CommandPaletteContext.Provider>
  );
}
