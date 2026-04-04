/**
 * Shared helper for examples — model string and global setup.
 *
 * Sets up the global credential store and provider registry so that
 * `createAgent()` can resolve model strings like "openai/gpt-4o"
 * automatically.
 *
 * Credential resolution order (per provider):
 *   1. Environment variable (e.g. OPENAI_API_KEY, GITHUB_TOKEN)
 *   2. Credential store (platform-aware path via resolveCredentialsPath())
 *      - For OAuth tokens (Copilot): automatically refreshes if expired
 *
 * Usage:
 *   MODEL=openai/gpt-4o bun run examples/core/scripts/01-basic-agent.ts
 *   MODEL=anthropic/claude-sonnet-4-5 bun run examples/core/scripts/01-basic-agent.ts
 *   MODEL=github-copilot/gpt-4o bun run examples/core/scripts/01-basic-agent.ts
 *   MODEL=ollama/llama3 bun run examples/core/scripts/01-basic-agent.ts
 *
 * Prerequisites:
 *   Install the provider package for your chosen provider:
 *     bun add @ai-sdk/openai            # for openai/*
 *     bun add @ai-sdk/anthropic          # for anthropic/*
 *     bun add @ai-sdk/openai-compatible  # for github-copilot/*
 *     bun add ollama-ai-provider         # for ollama/*
 *
 * Set the corresponding API key env var, or use the TUI to save credentials:
 *   export OPENAI_API_KEY=sk-...
 *   export ANTHROPIC_API_KEY=sk-ant-...
 *   export GITHUB_TOKEN=ghu_...          # for github-copilot (OAuth token from device flow)
 */

const DEFAULT_MODEL = "openai/gpt-4o";

/**
 * Get the model string from the MODEL env var (or a default).
 *
 * With the new architecture, `createAgent()` resolves model strings
 * internally — this helper simply reads the environment variable and
 * logs the chosen model.
 *
 * @example
 * ```ts
 * const model = getModelString();
 * const agent = createAgent({ name: "test", model });
 * ```
 */
export function getModelString(): string {
  const modelString = process.env.MODEL ?? DEFAULT_MODEL;
  console.log(`Using model: ${modelString}`);
  return modelString;
}
