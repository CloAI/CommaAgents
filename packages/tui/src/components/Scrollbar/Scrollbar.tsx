import { Box, Text } from "ink";
import type React from "react";

import type { ScrollbarTheme } from "./Scrollbar.theme";
import { useScrollbarTheme } from "./Scrollbar.theme";
import type { ScrollbarGeometry } from "./Scrollbar.types";
import { computeScrollbarGeometry } from "./Scrollbar.utils";

/** Props for the `Scrollbar` presentational component. */
export interface ScrollbarProps {
  /** Total number of scrollable units (e.g. lines or list items). */
  readonly total: number;
  /** Number of units currently visible. */
  readonly windowSize: number;
  /** Zero-based offset of the first visible unit into `total`. */
  readonly offset: number;
  /**
   * Height of the rendered scrollbar, in terminal rows. Defaults to
   * `windowSize` (one scrollbar row per visible unit).
   */
  readonly height?: number;
}

/**
 * A single-column vertical scrollbar.
 *
 * Purely presentational — the caller owns the scroll model and passes in
 * `total` / `windowSize` / `offset`. When the content fits (`total <=
 * windowSize`) the thumb fills the track, which is visually indistinguishable
 * from a "no scrolling possible" state.
 *
 * @example
 * ```tsx
 * <Scrollbar total={lines.length} windowSize={visibleRows} offset={scrollTop} />
 * ```
 */
export function Scrollbar(props: ScrollbarProps): React.ReactElement {
  const { total, windowSize, offset, height = windowSize } = props;
  const theme = useScrollbarTheme();
  const geometry = computeScrollbarGeometry({
    total,
    windowSize,
    offset,
    height,
  });

  return <ScrollbarRender theme={theme} {...geometry} />;
}

/** Props for the `ScrollbarRender` render-only form. */
export interface ScrollbarRenderProps extends ScrollbarGeometry {
  readonly theme: ScrollbarTheme;
}

/** Presentational form of `Scrollbar`; takes resolved geometry and theme. */
export function ScrollbarRender(
  props: ScrollbarRenderProps,
): React.ReactElement {
  const { theme, height, thumbTop, thumbHeight } = props;

  const rows: React.ReactElement[] = [];
  for (let rowIndex = 0; rowIndex < height; rowIndex += 1) {
    const isThumb = rowIndex >= thumbTop && rowIndex < thumbTop + thumbHeight;
    rows.push(
      <Text
        key={rowIndex}
        color={isThumb ? theme.thumbColor : theme.trackColor}
      >
        {isThumb ? theme.thumbChar : theme.trackChar}
      </Text>,
    );
  }

  return (
    <Box flexDirection="column" width={1} height={height} flexShrink={0}>
      {rows}
    </Box>
  );
}
