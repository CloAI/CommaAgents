import {
  type BoxProps,
  defineTheme,
  type TextProps,
  type ThemeOf,
} from "../../Theme";

/**
 * Memoized themed style objects for the `BorderedPanel` component.
 *
 * The header line is drawn manually (so we can embed a label inside the
 * top-border characters); the body's left/right/bottom borders use Ink's
 * built-in border rendering. Both must use the same glyph set or the
 * panel will look mismatched.
 */
export const useBorderedPanelTheme = defineTheme((tokens) => ({
  /** Outer column wrapping the header line and the body. */
  container: {
    flexDirection: "column",
    width: "100%",
    borderStyle: "round",
    borderBottom: false,
    borderRight: false,
    // borderLeft: false,
    paddingX: tokens.spacing.sm,
  } satisfies BoxProps,
  /** Single-row header line: `┌─ label ──...──┐`. */
  header: {
    position: "absolute",
    marginTop: -1,
    marginLeft: -1,
    flexDirection: "row",
    text: {
      bold: true,
    } satisfies TextProps,
  } satisfies BoxProps & { text: TextProps },
  /**
   * Glyphs used to compose the manual header line. Must match the
   * `borderStyle` of the body so the corners line up with the body's
   * left/right border characters.
   */
  glyphs: {
    /** Top-left corner: `┌`. */
    cornerLeft: "\u250C",
    /** Top-right corner: `┐`. */
    cornerRight: "\u2510",
    /** Horizontal fill character: `─`. */
    horizontal: "\u2500",
  },
  /**
   * Default color applied to every part of the panel border (header
   * glyphs + body border). Callers override per-message via the
   * `borderColor` prop.
   */
  borderColor: tokens.borders.color,
  /**
   * Default color for the header label text. Callers override per
   * message via `headerColor`.
   */
  headerColor: tokens.colors.primary,

  backgroundColor: tokens.colors.background,
  /** Whether the header label is bold by default. */
  headerBold: tokens.typography.labelBold,
}));

/** Resolved style object shape returned by {@link useBorderedPanelTheme}. */
export type BorderedPanelTheme = ThemeOf<typeof useBorderedPanelTheme>;
