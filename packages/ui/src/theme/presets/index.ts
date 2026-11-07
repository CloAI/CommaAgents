import { CATPPUCCIN_THEME } from "./catppuccin";
import { COMMA_THEME } from "./comma";
import { DRACULA_THEME } from "./dracula";
import { MATCHA_THEME } from "./matcha";
import { MONOKAI_THEME } from "./monokai";
import { NIGHT_OWL_THEME } from "./night-owl";
import { SOLARIZED_THEME } from "./solarized";
import { TOKYO_NIGHT_THEME } from "./tokyo-night";
import type { Theme } from "../theme.types";

export { COMMA_THEME };

/** Themes that ship with the application, Comma first. */
export const BUILT_IN_THEMES: readonly Theme[] = [
  COMMA_THEME,
  CATPPUCCIN_THEME,
  TOKYO_NIGHT_THEME,
  DRACULA_THEME,
  NIGHT_OWL_THEME,
  MATCHA_THEME,
  SOLARIZED_THEME,
  MONOKAI_THEME,
];
