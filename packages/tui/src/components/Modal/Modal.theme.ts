import {
  type BoxProps,
  defineTheme,
  type TextProps,
  type ThemeOf,
} from "../../theme";

/**
 * Returns themed style objects for the Modal component.
 * Consumes global tokens via `useTheme()`.
 */
export const useModalTheme = defineTheme((tokens) => ({
  overlay: {
    position: "absolute",
    width: "100%",
    height: "100%",
    justifyContent: "center",
    alignItems: "center",
  } satisfies BoxProps,
  content: {
    flexDirection: "column",
    borderStyle: tokens.borders.style as BoxProps["borderStyle"],
    borderColor: tokens.borders.color,
    paddingX: tokens.spacing.md,
    paddingY: tokens.spacing.sm,
    backgroundColor: tokens.colors.background,
    maxHeight: "50%",
    maxWidth: "40%",
  } satisfies BoxProps,
  title: {
    bold: tokens.typography.headerBold,
    color: tokens.colors.primary,
  } satisfies TextProps,
}));

export type ModalTheme = ThemeOf<typeof useModalTheme>;
