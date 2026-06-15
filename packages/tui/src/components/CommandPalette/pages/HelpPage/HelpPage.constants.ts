import type { ShortcutEntry } from "./HelpPage.types";

export const SHORTCUTS: readonly ShortcutEntry[] = [
  { keys: "Ctrl+P", description: "Toggle command palette" },
  { keys: "↑ / ↓", description: "Navigate list items" },
  { keys: "Enter", description: "Select item / confirm" },
  { keys: "Esc", description: "Go back / dismiss" },
  { keys: "Backspace", description: "Delete last character in search" },
  { keys: "Ctrl+C", description: "Quit the application" },
];
