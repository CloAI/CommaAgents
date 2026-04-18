import { Box } from "ink";
import type { ReactNode } from "react";
import type { MeasuredDimensions } from "./useMeasure";
import { useMeasure } from "./useMeasure";

/** Props accepted by MeasuredBox — same as ink Box plus a render-prop child. */
export interface MeasuredBoxProps {
  /** Render prop that receives the measured dimensions. */
  readonly children: (dimensions: MeasuredDimensions) => ReactNode;
  /** Width of the outer box. Defaults to "100%". */
  readonly width?: number | string;
  /** Flex direction. Defaults to "column". */
  readonly flexDirection?: "row" | "column" | "row-reverse" | "column-reverse";
  /** Flex grow factor. */
  readonly flexGrow?: number;
}

/**
 * A `<Box>` wrapper that measures its own rendered dimensions and
 * provides them to children via a render prop.
 *
 * Re-measures automatically when the terminal is resized.
 *
 * @example
 * ```tsx
 * <MeasuredBox width="100%">
 *   {({ width }) => (
 *     <Text>{"─".repeat(width)}</Text>
 *   )}
 * </MeasuredBox>
 * ```
 */
export function MeasuredBox({
  children,
  width = "100%",
  flexDirection = "column",
  flexGrow,
}: MeasuredBoxProps) {
  const { ref, dimensions } = useMeasure();

  return (
    <Box ref={ref} width={width} flexDirection={flexDirection} flexGrow={flexGrow}>
      {children(dimensions)}
    </Box>
  );
}
