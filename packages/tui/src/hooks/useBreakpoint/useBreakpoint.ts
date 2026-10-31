import { useWindowSize } from "ink";
import { useCallback, useMemo } from "react";

import type { BreakpointName, ThemeBreakpoints } from "../../Theme";
import { useTheme } from "../../Theme";
import type { BreakpointState } from "./useBreakpoint.types";

/** Ordered breakpoint names from smallest to largest. */
const BREAKPOINT_ORDER: readonly BreakpointName[] = [
  "xs",
  "sm",
  "md",
  "lg",
  "xl",
];

/** Resolve the active breakpoint name for a given column width (mobile-first). */
function resolveBreakpoint(
  columns: number,
  breakpoints: ThemeBreakpoints,
): BreakpointName {
  let matched: BreakpointName = "xs";
  for (const name of BREAKPOINT_ORDER) {
    if (columns >= breakpoints[name]) {
      matched = name;
    }
  }
  return matched;
}

/**
 * Track terminal dimensions and provide breakpoint query helpers.
 *
 * Tracks terminal resize events and resolves the
 * active breakpoint from the theme's `breakpoints` tokens (mobile-first).
 *
 * @example
 * ```tsx
 * const { breakpoint, above, below } = useBreakpoint();
 * if (below("md")) return <CompactView />;
 * return <FullView />;
 * ```
 */
export function useBreakpoint(): BreakpointState {
  const { columns, rows } = useWindowSize();
  const { breakpoints, containerWidths } = useTheme();

  const breakpoint = useMemo(
    () => resolveBreakpoint(columns, breakpoints),
    [columns, breakpoints],
  );

  const containerWidth = useMemo(
    () => containerWidths[breakpoint],
    [containerWidths, breakpoint],
  );

  const above = useCallback(
    (name: BreakpointName) => columns >= breakpoints[name],
    [columns, breakpoints],
  );

  const below = useCallback(
    (name: BreakpointName) => columns < breakpoints[name],
    [columns, breakpoints],
  );

  const between = useCallback(
    (lower: BreakpointName, upper: BreakpointName) =>
      columns >= breakpoints[lower] && columns < breakpoints[upper],
    [columns, breakpoints],
  );

  return useMemo(
    () => ({
      columns,
      rows,
      breakpoint,
      containerWidth,
      above,
      below,
      between,
    }),
    [columns, rows, breakpoint, containerWidth, above, below, between],
  );
}
