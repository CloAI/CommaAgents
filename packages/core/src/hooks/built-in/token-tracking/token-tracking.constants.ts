// Token tracking constants — model catalog with context window sizes.
//
// Maps "providerID/modelID" patterns to known context window metadata.
// This is best-effort; models not in the catalog require explicit metadata.

import type { ModelMetadata } from "./token-tracking.types";

/**
 * Built-in model catalog mapping model identifiers to context window metadata.
 *
 * TODO: Determine if this can be queried somehow to have a more generalized
 * way of getting this data.
 *
 * Keys are `"providerID/modelID"` strings matching the strategy model format.
 * Values are frozen ModelMetadata objects.
 *
 * This catalog covers widely-used models. For models not listed, pass
 * `modelMetadata` explicitly to `createTokenTracker()`.
 */
export const MODEL_CATALOG: Readonly<Record<string, ModelMetadata>> = {
  // OpenAI
  "openai/gpt-4o": { contextWindow: 128_000, maxOutputTokens: 16_384 },
  "openai/gpt-4o-mini": { contextWindow: 128_000, maxOutputTokens: 16_384 },
  "openai/gpt-4-turbo": { contextWindow: 128_000, maxOutputTokens: 4_096 },
  "openai/gpt-4": { contextWindow: 8_192, maxOutputTokens: 8_192 },
  "openai/gpt-3.5-turbo": { contextWindow: 16_385, maxOutputTokens: 4_096 },
  "openai/o1": { contextWindow: 200_000, maxOutputTokens: 100_000 },
  "openai/o1-mini": { contextWindow: 128_000, maxOutputTokens: 65_536 },
  "openai/o1-pro": { contextWindow: 200_000, maxOutputTokens: 100_000 },
  "openai/o3": { contextWindow: 200_000, maxOutputTokens: 100_000 },
  "openai/o3-mini": { contextWindow: 200_000, maxOutputTokens: 100_000 },
  "openai/o4-mini": { contextWindow: 200_000, maxOutputTokens: 100_000 },

  // Anthropic
  "anthropic/claude-sonnet-4-5": {
    contextWindow: 200_000,
    maxOutputTokens: 8_192,
  },
  "anthropic/claude-opus-4": { contextWindow: 200_000, maxOutputTokens: 8_192 },
  "anthropic/claude-3-5-haiku-latest": {
    contextWindow: 200_000,
    maxOutputTokens: 8_192,
  },
  "anthropic/claude-3-5-sonnet-latest": {
    contextWindow: 200_000,
    maxOutputTokens: 8_192,
  },
  "anthropic/claude-3-opus-latest": {
    contextWindow: 200_000,
    maxOutputTokens: 4_096,
  },

  // Google
  "google/gemini-2.5-pro": {
    contextWindow: 1_048_576,
    maxOutputTokens: 65_536,
  },
  "google/gemini-2.5-flash": {
    contextWindow: 1_048_576,
    maxOutputTokens: 65_536,
  },
  "google/gemini-2.0-flash": {
    contextWindow: 1_048_576,
    maxOutputTokens: 8_192,
  },
  "google/gemini-1.5-pro": { contextWindow: 2_097_152, maxOutputTokens: 8_192 },
  "google/gemini-1.5-flash": {
    contextWindow: 1_048_576,
    maxOutputTokens: 8_192,
  },

  // DeepSeek
  "deepseek/deepseek-chat": { contextWindow: 64_000, maxOutputTokens: 8_192 },
  "deepseek/deepseek-reasoner": {
    contextWindow: 64_000,
    maxOutputTokens: 8_192,
  },

  // Groq
  "groq/llama-3.3-70b-versatile": {
    contextWindow: 128_000,
    maxOutputTokens: 32_768,
  },
  "groq/llama-3.1-8b-instant": {
    contextWindow: 128_000,
    maxOutputTokens: 8_192,
  },
  "groq/mixtral-8x7b-32768": { contextWindow: 32_768, maxOutputTokens: 32_768 },

  // Mistral
  "mistral/mistral-large-latest": {
    contextWindow: 128_000,
    maxOutputTokens: 8_192,
  },
  "mistral/mistral-small-latest": {
    contextWindow: 128_000,
    maxOutputTokens: 8_192,
  },
  "mistral/codestral-latest": {
    contextWindow: 256_000,
    maxOutputTokens: 8_192,
  },

  // xAI
  "xai/grok-2": { contextWindow: 131_072, maxOutputTokens: 8_192 },
  "xai/grok-3": { contextWindow: 131_072, maxOutputTokens: 16_384 },
  "xai/grok-3-mini": { contextWindow: 131_072, maxOutputTokens: 16_384 },

  // Cohere
  "cohere/command-r-plus": { contextWindow: 128_000, maxOutputTokens: 4_096 },
  "cohere/command-r": { contextWindow: 128_000, maxOutputTokens: 4_096 },

  // GitHub Copilot (OpenAI-compatible)
  "github-copilot/gpt-4o": { contextWindow: 128_000, maxOutputTokens: 16_384 },
  "github-copilot/claude-sonnet-4": {
    contextWindow: 200_000,
    maxOutputTokens: 8_192,
  },
} as const;
