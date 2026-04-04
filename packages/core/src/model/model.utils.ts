// Model utility functions — pure helpers for parsing and inspecting model strings.

import { ModelResolutionError } from "../errors/index";
import { KNOWN_PROVIDERS } from "./model.constants";
import type { ParsedModel } from "./model.types";

// parseModel()

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
 * // => { providerID: "openai", modelID: "gpt-4o", packageName: "@ai-sdk/openai" }
 *
 * parseModel("ollama/meta-llama/llama-3")
 * // => { providerID: "ollama", modelID: "meta-llama/llama-3", packageName: "ollama-ai-provider" }
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
  };
}

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

// extractProviderIds()

/**
 * Extract unique provider IDs from a raw (already-parsed) strategy object.
 *
 * Scans each agent's `model` field for "providerID/modelID" strings.
 * Returns the set of unique provider IDs.
 *
 * Works on pre-validation data — silently skips invalid model strings.
 * This allows callers to discover required providers before the full
 * Zod validation pass.
 *
 * @example
 * ```ts
 * const raw = JSON.parse(strategyJson);
 * const providerIds = extractProviderIds(raw);
 * // => Set { "openai", "anthropic" }
 * ```
 */
export function extractProviderIds(raw: Record<string, unknown>): Set<string> {
  const ids = new Set<string>();

  // Helper: extract providerID from a "providerID/modelID" string
  const extract = (model: unknown): void => {
    if (typeof model !== "string") return;
    try {
      ids.add(parseModel(model).providerID);
    } catch {
      // Skip invalid model strings silently
    }
  };

  // Check agents[*].model
  const agents = raw.agents as Record<string, Record<string, unknown>> | undefined;
  if (agents) {
    for (const agentDefinition of Object.values(agents)) {
      extract(agentDefinition.model);
    }
  }

  return ids;
}
