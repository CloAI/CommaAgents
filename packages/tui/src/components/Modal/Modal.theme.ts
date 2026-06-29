import {
  type BoxProps,
  defineTheme,
  type TextProps,
  type Theme,
} from "../../Theme";

/** Resolve the Modal style objects from global theme tokens. */
export function createModalTheme(tokens: Theme) {
  return {
    content: {
      flexDirection: "column",
      borderStyle: tokens.borders.style as BoxProps["borderStyle"],
      borderColor: tokens.borders.color,
      backgroundColor: tokens.colors.background,
      maxHeight: "50%",
      maxWidth: "40%",
      overflow: "hidden",
    } satisfies BoxProps,
    title: {
      bold: tokens.typography.headerBold,
      color: tokens.colors.primary,
      wrap: "truncate-end",
    } satisfies TextProps,
  };
}

export const useModalTheme = defineTheme(createModalTheme);

export type ModalTheme = ReturnType<typeof createModalTheme>;
