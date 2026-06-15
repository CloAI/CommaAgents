import type { Command } from "./CommandPalette.types";

/**
 * The built-in command registry shown in the palette home view.
 *
 * Commands that navigate to a sub-page supply `page`; commands that fire
 * an effect immediately supply `action`.
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
    description:
      "Browse and inspect configured artificial intelligence providers",
    keywords: [
      "models",
      "large language model",
      "openai",
      "anthropic",
      "providers",
    ],
  },
  {
    id: "register-providers",
    label: "Register Providers",
    description: "Enable or disable large language model provider packages",
    keywords: [
      "register",
      "enable",
      "disable",
      "application programming interface",
      "oauth",
      "install",
    ],
  },
  {
    id: "run-picker",
    label: "Switch Run",
    description: "Open a previous run",
    keywords: ["history", "runs", "conversations", "switch"],
  },
  {
    id: "exit",
    label: "Exit",
    description: "Quit the application",
    keywords: ["quit", "close", "bye"],
    action: ({ exitApp }) => exitApp(),
  },
  {
    id: "new-run",
    label: "New Run",
    description: "Reset chat and return to intro screen",
    keywords: ["reset", "new", "start", "intro", "home"],
    action: ({ resetChat, closePalette }) => {
      resetChat();
      closePalette();
    },
  },
];
