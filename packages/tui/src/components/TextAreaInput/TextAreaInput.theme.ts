import { type BoxProps, defineTheme, type TextProps } from "../../Theme";

export const useTextAreaInputTheme = defineTheme((tokens) => ({
  textAreaInput: {
    backgroundColor: tokens.colors.surface,
    flexDirection: "row",
  } satisfies BoxProps,
  textAreaInputContent: {
    flexDirection: "column",
    flexGrow: 1,
  } satisfies BoxProps,
  textAreaPlaceholder: {
    color: tokens.colors.muted,
    wrap: "truncate",
  } satisfies TextProps,
}));
