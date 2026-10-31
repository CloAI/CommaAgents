import type { SettingsSection } from "./SettingsDialog.types";

export const SETTINGS_SECTIONS: readonly {
  readonly id: SettingsSection;
  readonly label: string;
}[] = [
  { id: "general", label: "General Settings" },
  { id: "appearance", label: "Appearance" },
  { id: "providers", label: "Providers" },
  { id: "hub", label: "Hub" },
  { id: "privacy", label: "Privacy" },
];
