import {
  type BoxProps,
  defineTheme,
  type TextProps,
  type ThemeOf,
} from "../../../Theme";

export const useSpawnedStrategyViewTheme = defineTheme((tokens) => ({
  container: {
    flexDirection: "column",
    marginTop: tokens.spacing.xs,
    marginBottom: tokens.spacing.xs,
  } satisfies BoxProps,
  body: {
    flexDirection: "column",
    paddingLeft: tokens.spacing.xs,
  } satisfies BoxProps,
  metaRow: {
    flexDirection: "row",
    marginBottom: tokens.spacing.xs,
  } satisfies BoxProps,
  detailRow: {
    flexDirection: "row",
    paddingLeft: tokens.spacing.sm,
  } satisfies BoxProps,
  nestedMessages: {
    flexDirection: "column",
  } satisfies BoxProps,
  runningGlyph: {
    color: tokens.colors.primary,
  } satisfies TextProps,
  completedGlyph: {
    color: tokens.colors.success,
  } satisfies TextProps,
  errorGlyph: {
    color: tokens.colors.error,
  } satisfies TextProps,
  title: {
    bold: tokens.typography.labelBold,
    color: tokens.colors.primary,
  } satisfies TextProps,
  detailLabel: {
    bold: tokens.typography.labelBold,
  } satisfies TextProps,
  openTarget: {
    flexDirection: "row",
  } satisfies BoxProps,
  openHint: {
    color: tokens.colors.primary,
    underline: true,
  } satisfies TextProps,
  muted: {
    dimColor: tokens.typography.secondaryDim,
  } satisfies TextProps,
  error: {
    color: tokens.colors.error,
  } satisfies TextProps,
  borderColor: {
    running: tokens.colors.primary,
    completed: tokens.colors.success,
    error: tokens.colors.error,
  },
}));

export type SpawnedStrategyViewTheme = ThemeOf<
  typeof useSpawnedStrategyViewTheme
>;
