import type { AppearanceSettings } from "../theme";

/** Saved connection preferences available throughout the application. */
export interface Settings {
  /** Daemon connection preferences. */
  readonly daemon: {
    /** Full WebSocket endpoint URL. */
    readonly url: string;
  };
  /** Path of the strategy chosen for new runs, when one was picked. */
  readonly strategyPath?: string;
  /** `provider/model` chosen per role name for new chats, keyed by strategy path. */
  readonly strategyModelRoles?: StrategyModelRoles;
  /** Named model-role configurations saved in this browser. */
  readonly modelRolePresets?: StrategyModelRoles;
  /** Selected theme, light or dark mode, and the user's own themes. */
  readonly appearance?: AppearanceSettings;
  /** Accent hue per chat pane, preserving the theme saturation and lightness. */
  readonly paneHues?: Readonly<Record<string, number>>;
}

/** Roles chosen for new chats, as strategy path to role name to `provider/model`. */
export type StrategyModelRoles = Readonly<
  Record<string, Readonly<Record<string, string>>>
>;

/** Versioned settings stored in this browser's local storage. */
export interface SettingsRecord extends Settings {
  /** Storage schema version. */
  readonly version: 1;
}

/** Settings loaded from storage, with a recoverable notice when defaults were used. */
export interface SettingsLoadResult {
  /** Saved settings or application defaults. */
  readonly settings: Settings;
  /** Explanation of a storage problem, or null for a normal load. */
  readonly notice: string | null;
}

/** Outcome of attempting to persist settings. */
export type SettingsSaveResult =
  | { readonly type: "success"; readonly settings: Settings }
  | { readonly type: "error"; readonly message: string };
