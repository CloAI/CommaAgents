import {
  listOpenAIModels,
  listAnthropicModels,
  listGoogleModels,
  listCopilotModels,
  listOllamaModels,
  listVeniceModels,
  listTinfoilModels,
} from "./listers/index";
import type { ProviderDefinition } from "./providers.types";

/**
 * Built-in provider definitions that are either missing from the catalog or
 * need to override catalog metadata (typically `packageName`).
 *
 * - `ollama` is absent from models.dev (local runtime); hardcode the npm package.
 * - `deepseek` exists in the catalog but is listed as `@ai-sdk/openai-compatible`;
 *   we prefer the dedicated `@ai-sdk/deepseek` package.
 */
export const BUILT_IN_OVERRIDES: readonly ProviderDefinition[] = [
  {
    id: "tinfoil",
    name: "Tinfoil",
    credentialType: "api",
    listModels: listTinfoilModels,
  },
  {
    id: "openai",
    name: "OpenAI",
    credentialType: "api",
    listModels: listOpenAIModels,
  },
  {
    id: "anthropic",
    name: "Anthropic",
    credentialType: "api",
    listModels: listAnthropicModels,
  },
  {
    id: "google",
    name: "Google",
    credentialType: "api",
    listModels: listGoogleModels,
  },
  {
    id: "venice",
    name: "Venice AI",
    credentialType: "api",
    listModels: listVeniceModels,
  },
  {
    id: "ollama",
    name: "Ollama",
    packageName: "ollama-ai-provider",
    credentialType: "none",
    listModels: listOllamaModels,
  },
  {
    id: "deepseek",
    name: "DeepSeek",
    packageName: "@ai-sdk/deepseek",
    credentialType: "api",
  },
  {
    id: "github-copilot",
    name: "GitHub Copilot",
    credentialType: "oauth",
    listModels: listCopilotModels,
  },
];
