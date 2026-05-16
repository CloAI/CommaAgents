import type { ThemeName } from "../../theme";

/**
 * Persisted user configuration for the TUI.
 *
 * Stored as JSON at `{config_dir}/comma-agents/tui-config.json`. New optional
 * fields can be added without breaking older config files because
 * `loadUserConfig` merges any partial input over the defaults.
 */
export interface UserConfig {
  /** Active theme name. */
  readonly themeName: ThemeName;
}

/** Public hook return type / React context value. */
export interface UserConfigContextType {
  /** Current resolved user config (defaults merged in). */
  readonly config: UserConfig;
  /** Replace the config entirely. Persists to disk asynchronously. */
  readonly setConfig: (next: UserConfig) => void;
  /** Patch a subset of the config and persist. */
  readonly updateConfig: (patch: Partial<UserConfig>) => void;
  /** Absolute path to the config file on disk. */
  readonly configFilePath: string;
}

/** Props for `UserConfigContextProvider`. */
export interface UserConfigContextProviderProps {
  /** Optional override for the config file path (used in tests). */
  readonly configFilePath?: string;
  /** Child components that can consume the user config. */
  readonly children: React.ReactNode;
}
