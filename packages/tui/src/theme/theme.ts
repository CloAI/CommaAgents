import type { Theme } from "./theme.types";
import { darkTheme } from "./themes/dark";

/**
 * Default theme — Material Dark (Material Design 3 palette).
 *
 * All colors in the registered themes use absolute hex literals (truecolor
 * SGR) so rendering is identical across terminals regardless of the user's
 * palette / theme preferences. Named ANSI colors ({@code "cyan"}, {@code
 * "red"}, etc.) are re-mapped by every terminal to its current color
 * scheme — never use them in tokens.
 */
export const defaultTheme: Theme = darkTheme;
