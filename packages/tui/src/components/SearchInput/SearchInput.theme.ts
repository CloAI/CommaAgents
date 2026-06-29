import {
  type BoxProps,
  defineTheme,
  type TextProps,
  type ThemeOf,
} from "../../Theme";

/**
 * Memoized themed style objects for the SearchInput component.
 */
export const useSearchInputTheme = defineTheme((tokens) => ({
  /** Rounded-border wrapper around the single-line input. */
  inputBorder: {
    borderStyle: "round",
    borderColor: tokens.colors.primary,
    paddingX: tokens.spacing.xs,
    width: "100%",
  } satisfies BoxProps,
  /** Text style for the prompt caret. */
  prompt: {
    color: tokens.colors.primary,
    bold: tokens.typography.labelBold,
  } satisfies TextProps,
  /** Text style for the user-entered query. */
  query: {
    color: tokens.colors.primary,
  } satisfies TextProps,
  /** Text style for the placeholder shown when the query is empty. */
  placeholder: {
    color: tokens.colors.muted,
    dimColor: tokens.typography.secondaryDim,
  } satisfies TextProps,
}));

/** Resolved style object shape returned by {@link useSearchInputTheme}. */
export type SearchInputTheme = ThemeOf<typeof useSearchInputTheme>;
