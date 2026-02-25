// Model string parsing, provider registry, and key resolution
//
// Core only contains metadata and parsing logic.
// Actual dynamic provider installation is handled by the daemon.

import { ModelResolutionError } from "../errors/index";

// ---------------------------------------------------------------------------
// Known Providers — maps providerID to npm package name
// ---------------------------------------------------------------------------

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

/**
 * Maps provider identifiers to the standard environment variable name for API keys.
 * Used by the key resolution layer to check environment variables first.
 */
export const PROVIDER_ENV_KEYS: Readonly<Record<string, string>> = {
  openai: "OPENAI_API_KEY",
  anthropic: "ANTHROPIC_API_KEY",
  google: "GOOGLE_GENERATIVE_AI_API_KEY",
  "google-vertex": "GOOGLE_VERTEX_API_KEY",
  "github-copilot": "GITHUB_TOKEN",
  groq: "GROQ_API_KEY",
  mistral: "MISTRAL_API_KEY",
  xai: "XAI_API_KEY",
  bedrock: "AWS_ACCESS_KEY_ID",
  azure: "AZURE_API_KEY",
  cohere: "COHERE_API_KEY",
  deepseek: "DEEPSEEK_API_KEY",
  fireworks: "FIREWORKS_API_KEY",
  together: "TOGETHER_AI_API_KEY",
  // Ollama typically doesn't need an API key
} as const;

// ---------------------------------------------------------------------------
// Parsed Model
// ---------------------------------------------------------------------------

/** Result of parsing a model string like "openai/gpt-4o". */
export interface ParsedModel {
  /** The provider identifier (e.g., "openai", "anthropic"). */
  readonly providerID: string;
  /** The model identifier (e.g., "gpt-4o", "claude-sonnet-4-5"). */
  readonly modelID: string;
  /** The npm package for the provider, if known. Undefined for custom providers. */
  readonly packageName: string | undefined;
  /** The standard env var name for the API key, if known. */
  readonly envKey: string | undefined;
}

// ---------------------------------------------------------------------------
// parseModel()
// ---------------------------------------------------------------------------

/**
 * Parse a model string in the format `providerID/modelID`.
 *
 * The model ID may contain slashes (e.g., `"ollama/meta-llama/llama-3"`),
 * so only the first slash is used as the separator.
 *
 * @throws {ModelResolutionError} If the string is empty or has no slash separator.
 *
 * @example
 * ```ts
 * parseModel("openai/gpt-4o")
 * // => { providerID: "openai", modelID: "gpt-4o", packageName: "@ai-sdk/openai", envKey: "OPENAI_API_KEY" }
 *
 * parseModel("ollama/meta-llama/llama-3")
 * // => { providerID: "ollama", modelID: "meta-llama/llama-3", packageName: "ollama-ai-provider", envKey: undefined }
 * ```
 */
export function parseModel(modelString: string): ParsedModel {
  if (!modelString || modelString.trim().length === 0) {
    throw new ModelResolutionError(modelString, "Model string cannot be empty");
  }

  const trimmed = modelString.trim();
  const slashIndex = trimmed.indexOf("/");

  if (slashIndex === -1) {
    throw new ModelResolutionError(
      trimmed,
      `Invalid model string "${trimmed}": expected format "providerID/modelID" (e.g., "openai/gpt-4o")`,
    );
  }

  if (slashIndex === 0) {
    throw new ModelResolutionError(
      trimmed,
      `Invalid model string "${trimmed}": provider ID cannot be empty`,
    );
  }

  const providerID = trimmed.slice(0, slashIndex);
  const modelID = trimmed.slice(slashIndex + 1);

  if (modelID.length === 0) {
    throw new ModelResolutionError(
      trimmed,
      `Invalid model string "${trimmed}": model ID cannot be empty`,
    );
  }

  return {
    providerID,
    modelID,
    packageName: KNOWN_PROVIDERS[providerID],
    envKey: PROVIDER_ENV_KEYS[providerID],
  };
}

// ---------------------------------------------------------------------------
// resolveKey() — API key resolution
// ---------------------------------------------------------------------------

/** Options for key resolution. */
export interface ResolveKeyOptions {
  /** Override: explicit API key (highest priority). */
  readonly apiKey?: string;
  /** Override: custom env var name to check. */
  readonly envVar?: string;
  /**
   * Function to read the credential store.
   * Injected by the daemon; core provides the interface but not the filesystem impl.
   * Returns the stored key for the provider, or undefined if not found.
   */
  readonly readCredential?: (providerID: string) => Promise<string | undefined>;
  /**
   * Config interpolation values (e.g., from strategy config).
   * Supports `{env:VAR_NAME}` and `{file:/path/to/key}` patterns.
   */
  readonly configValue?: string;
}

/**
 * Resolve an API key for a provider using the layered resolution strategy:
 *
 * 1. Explicit `apiKey` option (highest priority)
 * 2. Environment variable (standard or custom)
 * 3. Credential store (via injected reader)
 * 4. Config interpolation (`{env:VAR}` or `{file:PATH}`)
 *
 * Returns `undefined` if no key is found at any level.
 * This is not necessarily an error — some providers (e.g., Ollama) don't need keys.
 */
export async function resolveKey(
  providerID: string,
  options: ResolveKeyOptions = {},
): Promise<string | undefined> {
  // 1. Explicit API key
  if (options.apiKey) {
    return options.apiKey;
  }

  // 2. Environment variable
  const envVarName = options.envVar ?? PROVIDER_ENV_KEYS[providerID];
  if (envVarName) {
    const envValue = process.env[envVarName];
    if (envValue && envValue.trim().length > 0) {
      return envValue.trim();
    }
  }

  // 3. Credential store
  if (options.readCredential) {
    const stored = await options.readCredential(providerID);
    if (stored && stored.trim().length > 0) {
      return stored.trim();
    }
  }

  // 4. Config interpolation
  if (options.configValue) {
    const resolved = await resolveInterpolation(options.configValue);
    if (resolved && resolved.trim().length > 0) {
      return resolved.trim();
    }
  }

  return undefined;
}

// ---------------------------------------------------------------------------
// Config Interpolation
// ---------------------------------------------------------------------------

/**
 * Resolve config interpolation patterns:
 * - `{env:VAR_NAME}` — reads from environment variable
 * - `{file:/path/to/key}` — reads from file (first line, trimmed)
 *
 * Returns the raw string if no interpolation pattern is detected.
 */
export async function resolveInterpolation(value: string): Promise<string | undefined> {
  const trimmed = value.trim();

  // Pattern: {env:VAR_NAME}
  const envMatch = trimmed.match(/^\{env:([^}]+)\}$/);
  if (envMatch) {
    const varName = envMatch[1];
    if (!varName) return undefined;
    const envValue = process.env[varName];
    return envValue ?? undefined;
  }

  // Pattern: {file:/path/to/key}
  const fileMatch = trimmed.match(/^\{file:([^}]+)\}$/);
  if (fileMatch) {
    const filePath = fileMatch[1];
    if (!filePath) return undefined;
    try {
      const { readFile } = await import("node:fs/promises");
      const content = await readFile(filePath, "utf-8");
      // Return first line, trimmed
      const firstLine = content.split("\n")[0];
      return firstLine?.trim();
    } catch {
      // File not found or unreadable — return undefined, not an error
      return undefined;
    }
  }

  // No interpolation pattern — return as-is (it might be a raw key in config)
  return trimmed.length > 0 ? trimmed : undefined;
}

// ---------------------------------------------------------------------------
// isKnownProvider()
// ---------------------------------------------------------------------------

/** Check if a provider ID is in the known providers map. */
export function isKnownProvider(providerID: string): boolean {
  return providerID in KNOWN_PROVIDERS;
}

/**
 * Get the npm package name for a known provider.
 * Returns undefined for unknown providers.
 */
export function getProviderPackage(providerID: string): string | undefined {
  return KNOWN_PROVIDERS[providerID];
}
