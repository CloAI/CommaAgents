import { useMemo } from "react";
import { useTheme } from "./theme.context";
import type { Theme } from "./theme.types";

/** Builder mapping global tokens to spread-ready style objects. */
export type ThemeBuilder<ThemeShape> = (tokens: Theme) => ThemeShape;

/**
 * Define a memoized component-theme hook with the result type inferred from
 * the builder's return value. Mirrors the @comma-agents/tui pattern: write the
 * value once, the type is the value.
 */
export function defineTheme<ThemeShape>(
  builder: ThemeBuilder<ThemeShape>,
): () => ThemeShape {
  return function useDefinedTheme(): ThemeShape {
    const tokens = useTheme();
    return useMemo(() => builder(tokens), [tokens]);
  };
}

/** Extract the resolved theme shape from a `useXTheme` hook. */
export type ThemeOf<ThemeHook extends () => unknown> = ReturnType<ThemeHook>;
