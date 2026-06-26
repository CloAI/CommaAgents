import type React from "react";

export interface CommandPaletteContextType {
  /** Close the command palette. */
  readonly closePalette: () => void;
}

export interface CommandPaletteContextProviderProps {
  /** Close the command palette. */
  readonly closePalette: () => void;
  /** Components that can access command palette controls. */
  readonly children: React.ReactNode;
}
