import type { Settings } from "./settings.types";

export const SETTINGS_STORAGE_KEY = "comma-agents.settings";
export const DEFAULT_SETTINGS: Settings = {
  daemon: { url: "ws://127.0.0.1:7422/ws" },
};
