import type { Command } from "./CommandPalette.types";

/**
 * The built-in command registry shown in the palette home view.
 *
 * Commands that navigate to a sub-page supply `page`; commands that fire
 * an effect immediately supply `action`. The corresponding page components
 * are set in `CommandPalette.tsx` after import to avoid circular refs.
 */
export const BUILT_IN_COMMANDS: readonly Command[] = [
  {
    id: "help",
    label: "Help",
    description: "Show keyboard shortcuts and usage tips",
    keywords: ["shortcuts", "keys", "bindings", "usage"],
  },
  {
    id: "settings",
    label: "Settings",
    description: "Change theme and other application preferences",
    keywords: ["preferences", "config", "theme", "options"],
  },
  {
    id: "list-providers",
    label: "List Providers",
    description: "Browse and inspect configured AI providers",
    keywords: ["models", "llm", "openai", "anthropic", "providers"],
  },
  {
    id: "session-picker",
    label: "Switch Session",
    description: "Open a previous conversation session",
    keywords: ["history", "sessions", "conversations", "switch"],
  },
  {
    id: "exit",
    label: "Exit",
    description: "Quit the application",
    keywords: ["quit", "close", "bye"],
    action: ({ exitApp }) => exitApp(),
  },
];
