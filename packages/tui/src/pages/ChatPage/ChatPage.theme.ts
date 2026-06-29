import {
  type BoxProps,
  defineTheme,
  type TextProps,
  type ThemeOf,
} from "../../Theme";

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
    flexDirection: "column",
    height: "100%",
  } satisfies BoxProps,
  /** Header bar (strategy title). */
  header: {
    paddingX: tokens.spacing.sm,
    marginBottom: tokens.spacing.none,
    /** Title text style. */
    title: {
      bold: tokens.typography.headerBold,
      color: tokens.colors.primary,
    } satisfies TextProps,
  } satisfies BoxProps & { readonly title: TextProps },
  /**
   * Message list wrapper.
   *
   * `flexGrow: 1` claims leftover vertical space, but `flexShrink: 1` is
   * equally important: when the reply `<ChatTextArea>` (re)mounts on
   * `waiting_input`, the message area must yield rows for it. Yoga's
   * default `flexShrink` is 0, which would otherwise keep the message
   * area at its prior height and let the input overflow on top of the
   * messages. `minHeight: 0` removes the automatic min-content floor so
   * the shrink can actually take effect.
   */
  messageArea: {
    flexDirection: "column",
    flexGrow: 1,
    flexShrink: 1,
    minHeight: 0,
  } satisfies BoxProps,
  /** Footer bar (keyboard shortcuts). */
  footer: {
    paddingX: tokens.spacing.sm,
    /** Footer text style. */
    text: {
      dimColor: tokens.typography.secondaryDim,
    } satisfies TextProps,
  } satisfies BoxProps & { readonly text: TextProps },
}));

/** Resolved style shape returned by {@link useChatPageTheme}. */
export type ChatPageTheme = ThemeOf<typeof useChatPageTheme>;
