/**
 * Shared helper for examples — provider-agnostic model creation.
 *
 * Reads the MODEL environment variable (format: "providerID/modelID")
 * and dynamically imports the corresponding AI SDK provider package.
 *
 * Credential resolution order (per provider):
 *   1. Environment variable (e.g. OPENAI_API_KEY, GITHUB_TOKEN)
 *   2. Credential store (~/.local/share/comma-agents/auth.json)
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

import { parseModel } from "@comma-agents/core";
import type { LanguageModel } from "ai";
import { resolveCredential } from "../../auth";

const DEFAULT_MODEL = "openai/gpt-4o";

/**
 * Create a LanguageModel from the MODEL env var (or a default).
 *
 * This dynamically imports the AI SDK provider package and calls its
 * default export as a factory function with the model ID.
 *
 * Most AI SDK provider packages export a default function:
 *   import openai from "@ai-sdk/openai";
 *   const model = openai("gpt-4o");
 *
 * Special handling exists for:
 *   - github-copilot: Uses @ai-sdk/openai-compatible with the Copilot API
 *     endpoint and GitHub token authentication. Tokens are obtained via the
 *     GitHub App OAuth device flow (client ID: Ov23ctjLWBsnGRRwrakq) and
 *     automatically refreshed when expired.
 *
 * This helper does that dynamically so examples are provider-agnostic.
 */
export async function getModel(): Promise<LanguageModel> {
  const modelString = process.env.MODEL ?? DEFAULT_MODEL;
  const parsed = parseModel(modelString);

  if (!parsed.packageName) {
    throw new Error(
      `Unknown provider "${parsed.providerID}". ` +
        `Install the provider package manually and update this helper, ` +
        `or use a known provider (openai, anthropic, google, github-copilot, ollama, etc.).`,
    );
  }

  // --- GitHub Copilot: special handling ---
  // Copilot uses the OpenAI-compatible API at api.githubcopilot.com
  // with a GitHub token for authentication instead of a standard API key.
  if (parsed.providerID === "github-copilot") {
    return createCopilotModel(parsed.modelID, parsed.packageName);
  }

  // --- Standard providers ---
  // Dynamically import the provider package (must be installed)
  let providerModule: Record<string, unknown>;
  try {
    providerModule = await import(parsed.packageName);
  } catch {
    throw new Error(
      `Could not import "${parsed.packageName}". ` +
        `Install it with: bun add ${parsed.packageName}`,
    );
  }

  // AI SDK provider packages export a named provider instance matching the
  // provider ID (e.g. @ai-sdk/openai exports "openai", @ai-sdk/anthropic
  // exports "anthropic"). Fall back to "default" for older/custom packages.
  const factory = (providerModule[parsed.providerID] ?? providerModule.default) as
    | ((modelId: string) => LanguageModel)
    | undefined;
  if (typeof factory !== "function") {
    throw new Error(
      `Provider package "${parsed.packageName}" does not export a "${parsed.providerID}" ` +
        `or default factory function. Check the package documentation for the correct import.`,
    );
  }

  console.log(`Using model: ${parsed.providerID}/${parsed.modelID}`);
  return factory(parsed.modelID);
}

// ---------------------------------------------------------------------------
// GitHub Copilot provider
// ---------------------------------------------------------------------------

const COPILOT_BASE_URL = "https://api.githubcopilot.com";

/**
 * Create a LanguageModel backed by GitHub Copilot's API.
 *
 * Copilot exposes an OpenAI-compatible chat completions endpoint at
 * https://api.githubcopilot.com. Authentication is via a GitHub OAuth token
 * (obtained through the device flow) passed as a Bearer token.
 *
 * Token resolution:
 *   1. GITHUB_TOKEN environment variable
 *   2. Credential store (with automatic refresh for expired tokens)
 *
 * IMPORTANT: The Copilot API requires a GitHub OAuth token obtained via the
 * OAuth Device Flow. A standard `gh auth token` CLI token or a personal
 * access token will NOT work — the Copilot API returns 403 for those token
 * types. Use the TUI (`bun run tui`) to authenticate via the device flow,
 * or set GITHUB_TOKEN to a valid ghu_* token.
 */
async function createCopilotModel(modelID: string, packageName: string): Promise<LanguageModel> {
  // Resolve token: env var → credential store (with refresh)
  const token = await resolveCredential("github-copilot");
  if (!token) {
    throw new Error(
      "No GitHub Copilot token found.\n" +
        "Either:\n" +
        "  1. Run the TUI to authenticate: bun run tui\n" +
        "  2. Set the GITHUB_TOKEN env var to a valid OAuth token (ghu_*)\n\n" +
        "Note: Standard GitHub PATs and `gh auth token` CLI tokens will NOT work.\n" +
        "The Copilot API requires a token from the OAuth device flow.",
    );
  }

  let providerModule: Record<string, unknown>;
  try {
    providerModule = await import(packageName);
  } catch {
    throw new Error(
      `Could not import "${packageName}". ` + `Install it with: bun add ${packageName}`,
    );
  }

  // @ai-sdk/openai-compatible exports { createOpenAICompatible }
  const createOpenAICompatible = providerModule.createOpenAICompatible as (
    config: Record<string, unknown>,
  ) => (modelId: string) => LanguageModel;

  if (typeof createOpenAICompatible !== "function") {
    throw new Error(
      `Package "${packageName}" does not export createOpenAICompatible. ` +
        `Make sure you have @ai-sdk/openai-compatible installed.`,
    );
  }

  const copilot = createOpenAICompatible({
    name: "github-copilot",
    baseURL: COPILOT_BASE_URL,
    headers: {
      Authorization: `Bearer ${token}`,
      "Openai-Intent": "conversation-edits",
    },
  });

  console.log(`Using model: github-copilot/${modelID}`);
  return copilot(modelID);
}
