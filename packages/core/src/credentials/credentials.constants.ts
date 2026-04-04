import { EnvVarMap } from "./credentials.types";

/**
 * Well-known environment variable names for common AI providers.
 *
 * This is intentionally a subset — strategies can specify custom
 * env var names via the strategy schema, and users can extend
 * this map via configuration.
 */
export const WELL_KNOWN_ENV_VARS: EnvVarMap = {
  openai: ["OPENAI_API_KEY"],
  anthropic: ["ANTHROPIC_API_KEY"],
  google: ["GOOGLE_GENERATIVE_AI_API_KEY", "GOOGLE_API_KEY"],
  "google-vertex": ["GOOGLE_VERTEX_API_KEY"],
  "github-copilot": ["GITHUB_TOKEN"],
  mistral: ["MISTRAL_API_KEY"],
  cohere: ["COHERE_API_KEY"],
  groq: ["GROQ_API_KEY"],
  perplexity: ["PERPLEXITY_API_KEY"],
  fireworks: ["FIREWORKS_API_KEY"],
  together: ["TOGETHER_AI_API_KEY", "TOGETHER_API_KEY"],
  deepseek: ["DEEPSEEK_API_KEY"],
  xai: ["XAI_API_KEY"],
  openrouter: ["OPENROUTER_API_KEY"],
};