import type { ProviderInfo } from "./RegisteredProvidersPage.types";
import { UNPRINTABLE_KEYS } from "./RegisteredProvidersPage.constants";

/**
 * Creates a searchable string representation of a provider's details.
 */
export function createProviderSearchString(provider: ProviderInfo): string {
  // We use a local helper for labels to avoid importing constants if not needed,
  // but here we are in utils so it's fine.
  const labels: Record<string, string> = {
    api: "API Key",
    oauth: "OAuth",
    custom: "Custom",
    none: "local",
  };

  return [
    provider.id,
    provider.name,
    labels[provider.credentialType] ?? "",
    ...provider.models.map((model) => model.id),
  ].join(" ");
}

/**
 * Determines if a key input is a printable character.
 */
export function isPrintableCharacter(input: string, key: Record<string, unknown>): boolean {
  if (!input) return false;
  if (key.meta) return false;
  if (key.ctrl) return false;
  if (key.tab) return false;
  for (const printableKey of UNPRINTABLE_KEYS) {
    if (key[printableKey] === true) return false;
  }
  return true;
}
