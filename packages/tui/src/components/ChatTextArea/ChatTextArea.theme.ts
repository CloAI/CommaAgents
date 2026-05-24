import { type BoxProps, defineTheme, type TextProps } from "../../theme";

/**
 * Returns themed style objects for the ChatTextArea component.
 * Consumes global tokens via `useTheme()`.
 */
export const useChatTextAreaTheme = defineTheme((tokens) => ({
  container: {
    flexDirection: "column",
    borderStyle: "single",
    borderLeft: true,
    borderRight: true,
    borderTop: false,
    borderBottom: false,
    borderColor: tokens.colors.primary,
    borderBackgroundColor: tokens.colors.background,
  } satisfies BoxProps,
  strategyRow: {
    backgroundColor: tokens.colors.backgroundLayerTwo,
    flexDirection: "row",
    justifyContent: "space-between",
  } satisfies BoxProps,
  strategyLabel: {
    color: tokens.colors.primary,
    bold: true,
  } satisfies TextProps,
  hint: {
    color: tokens.colors.muted,
  } satisfies TextProps,
}));
