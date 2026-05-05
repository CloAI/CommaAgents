import { Box, Text } from "ink";
import type React from "react";
import type { BorderedPanelTheme } from "./BorderedPanel.theme";
import { useBorderedPanelTheme } from "./BorderedPanel.theme";

export interface BorderedPanelProps {
  /**
   * Label embedded into the top border, e.g. an agent name or sender role.
   *
   * Rendered inline in the top border row by overlaying the label text on
   * top of Ink's built-in border via an absolutely-positioned child.
   */
  readonly header: string;
  /**
   * Color applied to every border glyph (top, left, right, bottom).
   * Defaults to the theme's neutral border color when omitted.
   */
  readonly borderColor?: string;
  /**
   * Background color for the panel body. Also painted behind the header
   * label so the underlying top border is masked out where the label sits.
   */
  readonly backgroundColor?: string;
  /**
   * Color applied to the header label text. Defaults to the theme's
   * primary foreground color when omitted; callers typically pass a
   * role-specific color so the label matches the message owner.
   */
  readonly headerColor?: string;
  /** Body content rendered inside the panel. */
  readonly children: React.ReactNode;
}

/**
 * A column-shaped panel whose top border embeds a text label.
 *
 * Implementation: the body uses Ink's built-in `borderStyle: "single"` so
 * Yoga draws the entire frame (top, sides, bottom). The header label is
 * then painted over the top border via an absolutely-positioned child
 * with `marginTop: -1`, offset one column from the left corner so the
 * `┌` glyph stays visible. The label `<Text>` carries the panel's
 * background color so the dashes underneath are masked out — visually
 * indistinguishable from a hand-drawn `┌─ label ─...─┐` line, but with
 * **zero measurement**: no `useBoxMetrics`, no stdout listener, no
 * dash-fill math. Yoga handles the border and clipping for free.
 *
 * @example
 * ```tsx
 * <BorderedPanel header="planner" borderColor={colors.agentMessage}>
 *   <Text>...</Text>
 * </BorderedPanel>
 * ```
 */
export function BorderedPanel({
  header,
  borderColor,
  headerColor,
  backgroundColor,
  children,
}: BorderedPanelProps): React.ReactElement {
  const theme = useBorderedPanelTheme();

  const resolvedBorderColor = borderColor ?? theme.borderColor;
  const resolvedHeaderColor = headerColor ?? theme.headerColor;
  const resolvedBackgroundColor = backgroundColor ?? theme.backgroundColor;

  return (
    <BorderedPanelRender
      theme={theme}
      header={header}
      borderColor={resolvedBorderColor}
      headerColor={resolvedHeaderColor}
      backgroundColor={resolvedBackgroundColor}
    >
      {children}
    </BorderedPanelRender>
  );
}

export interface BorderedPanelRenderProps {
  /** Resolved BorderedPanel theme. */
  readonly theme: BorderedPanelTheme;
  /** Header label embedded into the top border. */
  readonly header: string;
  /** Resolved border color (no fallback handling here). */
  readonly borderColor: string;
  /** Resolved header label color (no fallback handling here). */
  readonly headerColor: string;
  /** Resolved background color (also masks the border behind the label). */
  readonly backgroundColor: string;
  /** Body content. */
  readonly children: React.ReactNode;
}

export function BorderedPanelRender({
  theme,
  header,
  borderColor,
  headerColor,
  backgroundColor,
  children,
}: BorderedPanelRenderProps): React.ReactElement {
  return (
    <Box
      flexDirection="column"
      width="100%"
      borderStyle="single"
      borderColor={borderColor}
      backgroundColor={backgroundColor}
      paddingX={theme.body.paddingX}
    >
      <Box position="absolute" marginTop={-1} marginLeft={-1} flexDirection="row">
        <Text backgroundColor={backgroundColor} color={borderColor}>
          {" "}
        </Text>
        <Text
          backgroundColor={backgroundColor}
          color={headerColor}
          bold={theme.headerBold}
        >
          {header}
        </Text>
        <Text backgroundColor={backgroundColor} color={borderColor}>
          {" "}
        </Text>
      </Box>
      {children}
    </Box>
  );
}
