import { Box, useBoxMetrics } from "ink";
import type React from "react";
import { type ReactNode, useRef } from "react";

/** Props accepted by MeasuredBox — same as ink Box plus a render-prop child. */
export type MeasuredBoxProps = {
  /** Render prop that receives the measured dimensions. */
  readonly children: (dimensions: {
    width: number;
    height: number;
    left: number;
    top: number;
  }) => ReactNode;
} & Omit<React.ComponentProps<typeof Box>, "children" | "ref">;

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
export function MeasuredBox({ children, ...boxProps }: MeasuredBoxProps) {
  const ref = useRef<import("ink").DOMElement | null>(null) as React.RefObject<
    import("ink").DOMElement
  >;
  const { width, height, left, top, hasMeasured } = useBoxMetrics(ref);

  return (
    <Box ref={ref} {...boxProps}>
      {hasMeasured ? children({ width, height, left, top }) : <></>}
    </Box>
  );
}
