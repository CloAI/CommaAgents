/**
 * Provider and example definitions — shared between interactive TUI and batch mode.
 */

// ---------------------------------------------------------------------------
// Provider configuration
// ---------------------------------------------------------------------------

export interface ProviderConfig {
  providerID: string;
  label: string;
  envVar: string;
  defaultModel: string;
}

export const PROVIDERS: ProviderConfig[] = [
  { providerID: "openai", label: "OpenAI", envVar: "OPENAI_API_KEY", defaultModel: "gpt-4o" },
  {
    providerID: "anthropic",
    label: "Anthropic",
    envVar: "ANTHROPIC_API_KEY",
    defaultModel: "claude-sonnet-4-5",
  },
  {
    providerID: "github-copilot",
    label: "GitHub Copilot",
    envVar: "GITHUB_TOKEN",
    defaultModel: "gpt-4o",
  },
];

export function findProvider(providerID: string): ProviderConfig | undefined {
  return PROVIDERS.find((p) => p.providerID === providerID);
}

// ---------------------------------------------------------------------------
// Example entries
// ---------------------------------------------------------------------------

export interface ExampleEntry {
  label: string;
  value: string;
  category: "core" | "daemon";
  /** If true, the example expects interactive stdin input (e.g., readline). */
  interactive?: boolean;
}

export const CORE_EXAMPLES: ExampleEntry[] = [
  { label: "01 — Basic Agent", value: "core/scripts/01-basic-agent.ts", category: "core" },
  {
    label: "02 — Agent with Tools",
    value: "core/scripts/02-agent-with-tools.ts",
    category: "core",
  },
  { label: "03 — Custom Tool", value: "core/scripts/03-custom-tool.ts", category: "core" },
  {
    label: "04 — Sequential Flow",
    value: "core/scripts/04-sequential-flow.ts",
    category: "core",
  },
  { label: "05 — Hooks", value: "core/scripts/05-hooks.ts", category: "core" },
  { label: "06 — Cycle Flow", value: "core/scripts/06-cycle-flow.ts", category: "core" },
  {
    label: "07 — Broadcast Flow",
    value: "core/scripts/07-broadcast-flow.ts",
    category: "core",
  },
  { label: "08 — Nested Flows", value: "core/scripts/08-nested-flows.ts", category: "core" },
  {
    label: "09 — Prompt Templates",
    value: "core/scripts/09-prompt-templates.ts",
    category: "core",
  },
  {
    label: "10 — Conversation History",
    value: "core/scripts/10-conversation-history.ts",
    category: "core",
  },
  {
    label: "11 — Strategy Files",
    value: "core/scripts/11-strategy-files.ts",
    category: "core",
  },
  { label: "12 — Streaming", value: "core/scripts/12-streaming.ts", category: "core" },
  {
    label: "13 — Abort / Cancellation",
    value: "core/scripts/13-abort-cancellation.ts",
    category: "core",
  },
  {
    label: "14 — hookIntoAgent",
    value: "core/scripts/14-hook-into-agent.ts",
    category: "core",
  },
];

export const DAEMON_EXAMPLES: ExampleEntry[] = [
  {
    label: "01 — Basic Client",
    value: "daemon/scripts/01-basic-client.ts",
    category: "daemon",
  },
  {
    label: "02 — Streaming Client",
    value: "daemon/scripts/02-streaming-client.ts",
    category: "daemon",
  },
  {
    label: "03 — Interactive Flow",
    value: "daemon/scripts/03-interactive-flow.ts",
    category: "daemon",
    interactive: true,
  },
  {
    label: "04 — Multi Flow",
    value: "daemon/scripts/04-multi-flow.ts",
    category: "daemon",
  },
];

export const ALL_EXAMPLES: ExampleEntry[] = [...CORE_EXAMPLES, ...DAEMON_EXAMPLES];
