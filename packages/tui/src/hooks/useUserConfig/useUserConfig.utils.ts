import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

import { resolveDataDir } from "@comma-agents/core";
import { THEME_REGISTRY, type ThemeName } from "../../Theme";
import {
  CONFIG_FILE_NAME,
  DEFAULT_USER_CONFIG,
} from "./useUserConfig.constants";
import type { UserConfig } from "./useUserConfig.types";

/** Resolve the TUI configuration file inside the shared user data directory. */
export function resolveDefaultConfigFilePath(): string {
  return join(resolveDataDir(), CONFIG_FILE_NAME);
}

/** Type guard for a valid `ThemeName`. */
function isThemeName(value: unknown): value is ThemeName {
  return typeof value === "string" && THEME_REGISTRY.has(value as ThemeName);
}

/**
 * Sanitize a parsed JSON object into a valid `UserConfig`. Unknown or
 * mistyped fields fall back to defaults so old config files keep working
 * after schema additions.
 */
export function normalizeUserConfig(raw: unknown): UserConfig {
  if (raw === null || typeof raw !== "object") {
    return DEFAULT_USER_CONFIG;
  }
  const candidate = raw as Record<string, unknown>;
  const themeName = isThemeName(candidate.themeName)
    ? candidate.themeName
    : DEFAULT_USER_CONFIG.themeName;
  return { themeName };
}

/**
 * Synchronously load the config file from disk. Returns defaults when the
 * file does not exist or fails to parse — startup must never crash because
 * of a corrupt config.
 */
export function loadUserConfig(filePath: string): UserConfig {
  if (!existsSync(filePath)) {
    return DEFAULT_USER_CONFIG;
  }
  try {
    const raw = readFileSync(filePath, "utf8");
    const parsed = JSON.parse(raw) as unknown;
    return normalizeUserConfig(parsed);
  } catch {
    return DEFAULT_USER_CONFIG;
  }
}

/**
 * Persist the config file to disk, creating the parent directory as needed.
 * Errors are swallowed so a read-only filesystem cannot crash the TUI — the
 * in-memory state remains correct for the current session.
 */
export function saveUserConfig(filePath: string, config: UserConfig): void {
  try {
    mkdirSync(dirname(filePath), { recursive: true });
    writeFileSync(filePath, `${JSON.stringify(config, null, 2)}\n`, "utf8");
  } catch {
    // Intentionally ignored — see JSDoc.
  }
}
