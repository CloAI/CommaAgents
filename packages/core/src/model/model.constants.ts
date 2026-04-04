// Model constants — known provider mappings.

/**
 * Maps short provider identifiers to their AI SDK npm package names.
 * This is metadata only — core never imports these packages directly.
 * The daemon uses this map to know which package to `bun add` when needed.
 */
export const KNOWN_PROVIDERS: Readonly<Record<string, string>> = {
  openai: "@ai-sdk/openai",
  anthropic: "@ai-sdk/anthropic",
  google: "@ai-sdk/google",
  "google-vertex": "@ai-sdk/google-vertex",
  "github-copilot": "@ai-sdk/openai-compatible",
  ollama: "ollama-ai-provider",
  groq: "@ai-sdk/groq",
  mistral: "@ai-sdk/mistral",
  xai: "@ai-sdk/xai",
  bedrock: "@ai-sdk/amazon-bedrock",
  azure: "@ai-sdk/azure",
  cohere: "@ai-sdk/cohere",
  deepseek: "@ai-sdk/deepseek",
  fireworks: "@ai-sdk/fireworks",
  together: "@ai-sdk/togetherai",
} as const;
