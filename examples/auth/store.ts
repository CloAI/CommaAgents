/**
 * Credential store — persists API keys and OAuth tokens to disk.
 *
 * Store location: ~/.local/share/comma-agents/auth.json (XDG-compliant)
 * File permissions: 0o600 (owner read/write only)
 *
 * Supports two credential types:
 *   - "api"   — standard API keys (OpenAI, Anthropic, etc.)
 *   - "oauth" — OAuth tokens with refresh (GitHub Copilot)
 */

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { z } from "zod";

// ---------------------------------------------------------------------------
// Schemas
// ---------------------------------------------------------------------------

/** Standard API key credential. */
export const ApiAuthSchema = z.object({
  type: z.literal("api"),
  key: z.string(),
});

/** OAuth credential with access + refresh tokens and expiry timestamps. */
export const OAuthSchema = z.object({
  type: z.literal("oauth"),
  /** Access token (e.g. ghu_* for GitHub Apps). */
  access: z.string(),
  /** Refresh token (e.g. ghr_* for GitHub Apps). */
  refresh: z.string(),
  /** Unix timestamp (ms) when the access token expires. 0 = never. */
  expires: z.number(),
  /** Unix timestamp (ms) when the refresh token expires. Omitted = never. */
  refreshExpiresAt: z.number().optional(),
});

/** Discriminated union of all credential types. */
export const AuthInfoSchema = z.discriminatedUnion("type", [ApiAuthSchema, OAuthSchema]);

export type ApiAuth = z.infer<typeof ApiAuthSchema>;
export type OAuthInfo = z.infer<typeof OAuthSchema>;
export type AuthInfo = z.infer<typeof AuthInfoSchema>;

// ---------------------------------------------------------------------------
// Store path
// ---------------------------------------------------------------------------

/**
 * Resolve the XDG-compliant data directory for comma-agents.
 *
 * Priority:
 *   1. $XDG_DATA_HOME/comma-agents  (Linux convention)
 *   2. ~/.local/share/comma-agents   (fallback)
 */
function dataDir(): string {
  const xdg = process.env.XDG_DATA_HOME;
  const base = xdg && xdg.length > 0 ? xdg : join(homedir(), ".local", "share");
  return join(base, "comma-agents");
}

function storePath(): string {
  return join(dataDir(), "auth.json");
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

async function readStore(): Promise<Record<string, unknown>> {
  try {
    const raw = await readFile(storePath(), "utf-8");
    const parsed = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
      return {};
    }
    return parsed as Record<string, unknown>;
  } catch {
    // File doesn't exist or is unreadable — start fresh.
    return {};
  }
}

async function writeStore(data: Record<string, AuthInfo>): Promise<void> {
  const dir = dataDir();
  await mkdir(dir, { recursive: true });
  const json = JSON.stringify(data, null, 2);
  await writeFile(storePath(), json, { mode: 0o600 });
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Get a stored credential for a provider.
 * Returns `undefined` if nothing is stored or the stored data is invalid.
 */
export async function get(providerID: string): Promise<AuthInfo | undefined> {
  const store = await readStore();
  const entry = store[providerID];
  if (entry === undefined) return undefined;
  const result = AuthInfoSchema.safeParse(entry);
  return result.success ? result.data : undefined;
}

/**
 * Store a credential for a provider.
 * Overwrites any existing credential for that provider.
 */
export async function set(providerID: string, info: AuthInfo): Promise<void> {
  const store = await all();
  store[providerID] = info;
  await writeStore(store);
}

/**
 * Remove a stored credential for a provider.
 * No-op if no credential is stored for that provider.
 */
export async function remove(providerID: string): Promise<void> {
  const store = await all();
  if (!(providerID in store)) return;
  delete store[providerID];
  await writeStore(store);
}

/**
 * Get all stored credentials, validated.
 * Invalid entries are silently dropped.
 */
export async function all(): Promise<Record<string, AuthInfo>> {
  const raw = await readStore();
  const result: Record<string, AuthInfo> = {};
  for (const [key, value] of Object.entries(raw)) {
    const parsed = AuthInfoSchema.safeParse(value);
    if (parsed.success) {
      result[key] = parsed.data;
    }
  }
  return result;
}
