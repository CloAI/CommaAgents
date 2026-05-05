import { useStdout } from "ink";
import { useCallback, useEffect, useMemo, useState } from "react";

import type { BreakpointName, ThemeBreakpoints } from "../../theme";
import { useTheme } from "../../theme";
import type { BreakpointState } from "./useBreakpoint.types";

/** Ordered breakpoint names from smallest to largest. */
const BREAKPOINT_ORDER: readonly BreakpointName[] = ["xs", "sm", "md", "lg", "xl"];

/** Resolve the active breakpoint name for a given column width (mobile-first). */
function resolveBreakpoint(columns: number, breakpoints: ThemeBreakpoints): BreakpointName {
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
 * Uses Ink's `useStdout()` to listen for resize events and resolves the
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
  const { stdout } = useStdout();
  const { breakpoints, containerWidths } = useTheme();

  const [columns, setColumns] = useState(() => stdout?.columns ?? process.stdout.columns);
  const [rows, setRows] = useState(() => stdout?.rows ?? process.stdout.rows);

  useEffect(() => {
    if (!stdout) return;

    const handleResize = () => {
      setColumns(stdout.columns);
      setRows(stdout.rows);
    };

    stdout.on("resize", handleResize);
    return () => {
      stdout.off("resize", handleResize);
    };
  }, [stdout]);

  const breakpoint = useMemo(() => resolveBreakpoint(columns, breakpoints), [columns, breakpoints]);

  const containerWidth = useMemo(() => containerWidths[breakpoint], [containerWidths, breakpoint]);

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
    () => ({ columns, rows, breakpoint, containerWidth, above, below, between }),
    [columns, rows, breakpoint, containerWidth, above, below, between],
  );
}
