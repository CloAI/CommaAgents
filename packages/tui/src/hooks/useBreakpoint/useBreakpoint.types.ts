import type { BreakpointName } from "../../Theme";

/** Result returned by `useBreakpoint()`. */
export interface BreakpointState {
  /** Current terminal width in columns. */
  readonly columns: number;
  /** Current terminal height in rows. */
  readonly rows: number;
  /** The active breakpoint name based on terminal width. */
  readonly breakpoint: BreakpointName;
  /** Resolved container width for the active breakpoint. `undefined` means full width. */
  readonly containerWidth: number | undefined;
  /** True when terminal width is at least the given breakpoint. */
  readonly above: (name: BreakpointName) => boolean;
  /** True when terminal width is below the given breakpoint. */
  readonly below: (name: BreakpointName) => boolean;
  /** True when terminal width is between two breakpoints (inclusive lower, exclusive upper). */
  readonly between: (lower: BreakpointName, upper: BreakpointName) => boolean;
}
