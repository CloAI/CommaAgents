import { useMemo } from "react";
import type { Theme } from "./Theme.types";
import { useTheme } from "./useTheme";

/**
 * Builder function passed to `defineTheme`. Receives the global theme tokens
 * and returns the component's spread-ready style objects.
 *
 * The returned object's literal shape is preserved by inference, so callers
 * never have to hand-write a parallel `XTheme` interface — `ThemeOf<typeof
 * useXTheme>` extracts it.
 */
export type ThemeBuilder<ThemeShape> = (tokens: Theme) => ThemeShape;

/**
 * Define a memoized component-theme hook with the result type inferred
 * directly from the builder's return value.
 *
 * Per-component theme files used to declare an `XTheme` interface and a
 * `useXTheme()` hook that returned a parallel object literal — every field
 * was duplicated between the type and the value. `defineTheme` collapses
 * the two: write the value once, the type is the value.
 *
 * Use `satisfies BoxProps` / `satisfies TextProps` on nested style objects
 * intended to be spread into Ink `<Box>` / `<Text>`. This gives full
 * autocomplete on Ink prop names AND keeps literal types narrow without
 * `as const` — the literal `"column"` is checked against the union
 * `"row" | "column" | …` so it never widens to `string`.
 *
 * @param builder - Pure function that maps global tokens to spread-ready style objects.
 * @example
 * ```ts
 * import type { BoxProps, TextProps } from "ink";
 *
 * export const useChatPageTheme = defineTheme((tokens) => ({
 *   root: { flexDirection: "column", height: "100%" } satisfies BoxProps,
 *   header: {
 *     paddingX: tokens.spacing.sm,
 *     title: {
 *       bold: tokens.typography.headerBold,
 *       color: tokens.colors.primary,
 *     } satisfies TextProps,
 *   },
 * }));
 *
 * // Components consume the inferred type via `ThemeOf` — no parallel
 * // interface to maintain.
 * export type ChatPageTheme = ThemeOf<typeof useChatPageTheme>;
 * ```
 */
export function defineTheme<ThemeShape>(
  builder: ThemeBuilder<ThemeShape>,
): () => ThemeShape {
  return function useDefinedTheme(): ThemeShape {
    const tokens = useTheme();
    // Tokens reference identity is stable across renders unless the provider
    // value changes, so a [tokens] dependency is enough.
    return useMemo(() => builder(tokens), [tokens]);
  };
}

/**
 * Extract the resolved theme shape from a `useXTheme` hook produced by
 * `defineTheme`. Lets components type their `theme` prop without a parallel
 * interface declaration.
 */
export type ThemeOf<ThemeHook extends () => unknown> = ReturnType<ThemeHook>;
