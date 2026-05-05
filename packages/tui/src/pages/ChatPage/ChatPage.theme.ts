import { defineTheme, type ThemeOf } from "../../theme";

/**
 * Memoized themed style objects for the ChatPage component.
 *
 * Authored with `defineTheme` so the resolved shape is inferred from the
 * value — no parallel `ChatPageTheme` interface to maintain. Consumers that
 * need to type the resolved shape import {@link ChatPageTheme}, which is a
 * `ReturnType` alias rather than a hand-written declaration.
 *
 * Note: separator styling is now owned by the `<Separator />` component, so
 * it no longer appears here.
 */
export const useChatPageTheme = defineTheme((tokens) => ({
  /** Root container (column layout, full height). */
  root: {
    flexDirection: "column" as const,
    height: "100%" as const,
  },
  /** Header bar (strategy title). */
  header: {
    paddingX: tokens.spacing.sm,
    marginBottom: tokens.spacing.none,
    /** Title text style. */
    title: {
      bold: tokens.typography.headerBold,
      color: tokens.colors.primary,
    },
  },
  /** Message list wrapper (grows to fill). */
  messageArea: {
    flexDirection: "column" as const,
    flexGrow: 1,
  },
  /** Footer bar (keyboard shortcuts). */
  footer: {
    paddingX: tokens.spacing.sm,
    /** Footer text style. */
    text: {
      dimColor: tokens.typography.secondaryDim,
    },
  },
}));

/** Resolved style shape returned by {@link useChatPageTheme}. */
export type ChatPageTheme = ThemeOf<typeof useChatPageTheme>;
