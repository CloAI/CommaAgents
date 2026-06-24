import { DEFAULT_THEME_NAME } from "../../Theme/themes";
import type { UserConfig } from "./useUserConfig.types";

/** Filename of the persisted TUI configuration. */
export const CONFIG_FILE_NAME = "tui-config.json";

/** Defaults applied when no config file exists or fields are missing. */
export const DEFAULT_USER_CONFIG: UserConfig = {
  themeName: DEFAULT_THEME_NAME,
};
