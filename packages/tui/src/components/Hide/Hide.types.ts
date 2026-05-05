import type { BreakpointName } from "../../theme";

/** A breakpoint name or a specific column width. */
export type BreakpointOrColumns = BreakpointName | number;

/** Props for the `Hide` component. */
export interface HideProps {
  /** Hide children when terminal width is below this breakpoint or column count. */
  readonly below?: BreakpointOrColumns;
  /** Hide children when terminal width is at or above this breakpoint or column count. */
  readonly above?: BreakpointOrColumns;
  /** Child content to conditionally render. */
  readonly children: React.ReactNode;
}
