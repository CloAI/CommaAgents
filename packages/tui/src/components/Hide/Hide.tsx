import type React from "react";

import { useBreakpoint } from "../../hooks/useBreakpoint";
import type { BreakpointName } from "../../theme";
import { useTheme } from "../../theme";
import type { BreakpointOrColumns, HideProps } from "./Hide.types";

/** Resolve a breakpoint name or raw column number to a column threshold. */
function resolveThreshold(
  value: BreakpointOrColumns,
  breakpoints: Readonly<Record<BreakpointName, number>>,
): number {
  return typeof value === "number" ? value : breakpoints[value];
}

/**
 * Conditionally hide children based on terminal width.
 *
 * Accepts either a named breakpoint (`"sm"`, `"md"`, etc.) or a raw
 * column count for both `below` and `above` props.
 *
 * @param props - Visibility conditions and children.
 * @example
 * ```tsx
 * <Hide below="md">
 *   <DetailedSidebar />
 * </Hide>
 * <Hide below={128}>
 *   <TitleLogo />
 * </Hide>
 * ```
 */
export function Hide({ below, above, children }: HideProps): React.ReactNode {
  const { columns } = useBreakpoint();
  const { breakpoints } = useTheme();

  if (below !== undefined && columns < resolveThreshold(below, breakpoints))
    return null;
  if (above !== undefined && columns >= resolveThreshold(above, breakpoints))
    return null;

  return children;
}
