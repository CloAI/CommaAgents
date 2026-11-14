/**
 * useTerminalSize — returns the current terminal dimensions and updates on resize.
 */

import { useWindowSize } from "ink";

export interface TerminalSize {
  columns: number;
  rows: number;
}

export function useTerminalSize(): TerminalSize {
  return useWindowSize();
}
