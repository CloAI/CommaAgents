import type { Command } from "./CommandPalette.types";
import { ExitPage } from "./pages/ExitPage";
import { HelpPage } from "./pages/HelpPage";
import { HubPackagesPage } from "./pages/HubPackagesPage";
import { ListProvidersPage } from "./pages/ListProvidersPage";
import { McpServersPage } from "./pages/McpServersPage";
import { NewRunPage } from "./pages/NewRunPage";
import { RegisteredProvidersPage } from "./pages/RegisteredProvidersPage";
import { RunPickerPage } from "./pages/RunPickerPage";
import { SettingsPage } from "./pages/SettingsPage";

/**
 * The built-in command registry shown in the palette home view.
 *
 * Each command owns the page mounted when the command is selected.
 */
export const BUILT_IN_COMMANDS: readonly Command[] = [
  {
    id: "help",
    label: "Help",
    description: "Show keyboard shortcuts and usage tips",
    keywords: ["shortcuts", "keys", "bindings", "usage"],
    page: HelpPage,
  },
  {
    id: "settings",
    label: "Settings",
    description: "Change theme and other application preferences",
    keywords: ["preferences", "config", "theme", "options"],
    page: SettingsPage,
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
    page: ListProvidersPage,
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
    page: RegisteredProvidersPage,
  },
  {
    id: "mcp-servers",
    label: "MCP Servers",
    description: "Enable, disable, and inspect Model Context Protocol servers",
    keywords: ["mcp", "tools", "servers", "connections", "model context"],
    page: McpServersPage,
  },
  {
    id: "hub-packages",
    label: "Hub Packages",
    description: "Browse, install, update, and remove strategy packages",
    keywords: ["hub", "packages", "strategies", "install", "update", "remove"],
    page: HubPackagesPage,
  },
  {
    id: "run-picker",
    label: "Switch Run",
    description: "Open a previous run",
    keywords: ["history", "runs", "conversations", "switch"],
    page: RunPickerPage,
  },
  {
    id: "exit",
    label: "Exit",
    description: "Quit the application",
    keywords: ["quit", "close", "bye"],
    page: ExitPage,
  },
  {
    id: "new-run",
    label: "New Run",
    description: "Reset chat and return to intro screen",
    keywords: ["reset", "new", "start", "intro", "home"],
    page: NewRunPage,
  },
];
