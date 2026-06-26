import {
  CREDENTIAL_TYPE_LABELS,
  UNPRINTABLE_KEYS,
} from "./RegisteredProvidersPage.constants";
import type { ProviderInfo } from "./RegisteredProvidersPage.types";

/**
 * Creates a searchable string representation of a provider's details.
 */
export function createProviderSearchString(provider: ProviderInfo): string {
  return [
    provider.id,
    provider.name,
    CREDENTIAL_TYPE_LABELS[provider.credentialType] ?? "",
    ...provider.models.map((model) => model.id),
  ].join(" ");
}

/**
 * Determines if a key input is a printable character.
 */
export function isPrintableCharacter(
  input: string,
  key: Record<string, unknown>,
): boolean {
  if (!input) return false;
  if (key.meta) return false;
  if (key.ctrl) return false;
  if (key.tab) return false;
  for (const printableKey of UNPRINTABLE_KEYS) {
    if (key[printableKey] === true) return false;
  }
  return true;
}
