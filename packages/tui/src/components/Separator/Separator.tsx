import { Box, Text } from "ink";
import type React from "react";
import type { SeparatorTheme } from "./Separator.theme";
import { useSeparatorTheme } from "./Separator.theme";

/**
 * "Long enough" repeat count for the truncation-based fill.
 *
 * The separator's full-width mode fills its parent by repeating the
 * separator glyph a large number of times and letting Yoga truncate the
 * resulting `<Text>` to the available width via `wrap="truncate"`. The
 * value just needs to exceed any plausible terminal width — 1000 columns
 * is well beyond what any real terminal supports.
 */
const FILL_REPEAT_COUNT = 1000;

export interface SeparatorProps {
  /**
   * Width of the separator line.
   *
   * - `"full"` (default): spans the available width of the parent flex
   *   container. Implemented via Yoga's flex layout + text truncation —
   *   no measurement, no resize listeners, no first-frame flash.
   * - `number`: a fixed number of characters, useful for callouts or
   *   visual rhythm where a uniform width across terminals is desired.
   */
  readonly width?: "full" | number;
}

/**
 * Horizontal separator line.
 *
 * Defaults to filling the available width of its parent flex container.
 * Pass a numeric `width` for a fixed-length separator.
 *
 * @example
 * ```tsx
 * // Fills parent's available width:
 * <Separator />
 * // Fixed 40-character separator:
 * <Separator width={40} />
 * ```
 */
export function Separator({
  width = "full",
}: SeparatorProps): React.ReactElement {
  const theme = useSeparatorTheme();
  return <SeparatorRender theme={theme} width={width} />;
}

export interface SeparatorRenderProps {
  /** Resolved separator theme. */
  readonly theme: SeparatorTheme;
  /**
   * Width mode: `"full"` grows to fill the parent via flex+truncate,
   * a `number` renders a fixed-length line.
   */
  readonly width?: "full" | number;
}

export function SeparatorRender({
  theme,
  width = "full",
}: SeparatorRenderProps): React.ReactElement {
  if (typeof width === "number") {
    // Fixed-width: repeat exactly `width` chars, no flex, no measurement.
    return <Text {...theme.text}>{theme.char.repeat(width)}</Text>;
  }

  // Full-width: render an over-long string of separator glyphs and let
  // Yoga hard-wrap it at the parent's available width. The first wrapped
  // line is exactly `─` × width; subsequent wrap lines are clipped by the
  // box's `height: 1` + `overflow: "hidden"`. We deliberately use
  // `wrap="hard"` (not `truncate-end`) because the truncate variants
  // append an ellipsis ("…") which would visibly break the line.
  return (
    <Box
      flexDirection={theme.container.flexDirection}
      flexGrow={theme.container.flexGrow}
      flexShrink={theme.container.flexShrink}
      alignSelf={theme.container.alignSelf}
      paddingX={theme.container.paddingX}
      height={1}
      overflow="hidden"
    >
      <Text {...theme.text} wrap="hard">
        {theme.char.repeat(FILL_REPEAT_COUNT)}
      </Text>
    </Box>
  );
}
