// Provider registry persistence — reads/writes `provider-registry.json`
// in the shared data directory (same directory as credentials.json).

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { resolveDataDir } from "@comma-agents/core";

const PROVIDER_REGISTRY_FILENAME = "provider-registry.json";

function resolveProviderRegistryPath(): string {
  return join(resolveDataDir(), PROVIDER_REGISTRY_FILENAME);
}

function ensureDataDir(): void {
  mkdirSync(resolveDataDir(), { recursive: true });
}

export function loadRegisteredProviders(): string[] {
  try {
    const filePath = resolveProviderRegistryPath();
    const raw = readFileSync(filePath, "utf-8").trim();
    if (raw.length === 0) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (item): item is string => typeof item === "string" && item.length > 0,
    );
  } catch (caughtError) {
    if (
      caughtError instanceof Error &&
      (caughtError as NodeJS.ErrnoException).code === "ENOENT"
    ) {
      return [];
    }
    return [];
  }
}

export function saveRegisteredProviders(providerIds: string[]): void {
  ensureDataDir();
  const filePath = resolveProviderRegistryPath();
  writeFileSync(filePath, JSON.stringify(providerIds, null, 2), {
    mode: 0o600,
  });
}
