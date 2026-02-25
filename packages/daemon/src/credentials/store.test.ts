// Tests for the credential store: JsonFileBackend + createCredentialStore.

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { Credential } from "../protocol/shared";
import { createJsonFileBackend } from "./backends/json-file";
import { createCredentialStore } from "./store";
import type { CredentialBackend, CredentialStoreData } from "./types";
import { WELL_KNOWN_ENV_VARS } from "./types";

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

const TEST_DIR = join(import.meta.dir, "__test_credentials__");
const TEST_FILE = join(TEST_DIR, "credentials.json");

function cleanup() {
  if (existsSync(TEST_DIR)) {
    rmSync(TEST_DIR, { recursive: true, force: true });
  }
}

const apiKey: Credential = { type: "api", key: "sk-test-123" };
const oauthCred: Credential = {
  type: "oauth",
  accessToken: "gho_abc",
  refreshToken: "ghr_xyz",
  expiresAt: "2026-12-01T00:00:00.000Z",
};
const customCred: Credential = {
  type: "custom",
  data: { token: "abc", region: "us-east-1" },
};

/** In-memory backend for store tests (avoids filesystem coupling). */
function createMemoryBackend(initial: CredentialStoreData = {}): CredentialBackend {
  let data = structuredClone(initial);
  return {
    async readAll() {
      return structuredClone(data);
    },
    async writeAll(newData) {
      data = structuredClone(newData);
    },
  };
}

// ---------------------------------------------------------------------------
// JsonFileBackend
// ---------------------------------------------------------------------------

describe("JsonFileBackend", () => {
  beforeEach(cleanup);
  afterEach(cleanup);

  test("readAll returns empty object when file does not exist", async () => {
    const backend = createJsonFileBackend({ filePath: TEST_FILE });
    expect(await backend.readAll()).toEqual({});
  });

  test("writeAll creates parent directories", async () => {
    const nested = join(TEST_DIR, "deep", "nested", "credentials.json");
    const backend = createJsonFileBackend({ filePath: nested });
    await backend.writeAll({ $global: { openai: apiKey } });
    expect(existsSync(nested)).toBe(true);
  });

  test("writeAll + readAll round-trips data", async () => {
    mkdirSync(TEST_DIR, { recursive: true });
    const backend = createJsonFileBackend({ filePath: TEST_FILE });

    const data: CredentialStoreData = {
      $global: { openai: apiKey, anthropic: oauthCred },
      "my-strategy": { "custom-llm": customCred },
    };
    await backend.writeAll(data);
    const read = await backend.readAll();
    expect(read).toEqual(data);
  });

  test("writeAll sets file permissions to 0o600 on Unix", async () => {
    if (process.platform === "win32") return; // skip on Windows
    mkdirSync(TEST_DIR, { recursive: true });
    const backend = createJsonFileBackend({ filePath: TEST_FILE });
    await backend.writeAll({ $global: { openai: apiKey } });

    const stats = statSync(TEST_FILE);
    // mode includes file type bits; mask to get permission bits only
    const perms = stats.mode & 0o777;
    expect(perms).toBe(0o600);
  });

  test("readAll returns empty for empty file", async () => {
    mkdirSync(TEST_DIR, { recursive: true });
    writeFileSync(TEST_FILE, "", "utf-8");
    const backend = createJsonFileBackend({ filePath: TEST_FILE });
    expect(await backend.readAll()).toEqual({});
  });

  test("readAll returns empty for invalid JSON", async () => {
    mkdirSync(TEST_DIR, { recursive: true });
    writeFileSync(TEST_FILE, "not-json{{{", "utf-8");
    const backend = createJsonFileBackend({ filePath: TEST_FILE });
    expect(await backend.readAll()).toEqual({});
  });

  test("readAll returns empty for valid JSON but invalid schema", async () => {
    mkdirSync(TEST_DIR, { recursive: true });
    // Valid JSON but wrong shape — credentials should have a type field
    writeFileSync(TEST_FILE, JSON.stringify({ $global: { openai: "just-a-string" } }), "utf-8");
    const backend = createJsonFileBackend({ filePath: TEST_FILE });
    expect(await backend.readAll()).toEqual({});
  });

  test("writeAll validates data before writing", async () => {
    mkdirSync(TEST_DIR, { recursive: true });
    const backend = createJsonFileBackend({ filePath: TEST_FILE });
    // Pass invalid data — should throw
    await expect(
      backend.writeAll({
        $global: { openai: { type: "invalid" } },
      } as unknown as CredentialStoreData),
    ).rejects.toThrow();
  });

  test("writeAll produces readable JSON", async () => {
    mkdirSync(TEST_DIR, { recursive: true });
    const backend = createJsonFileBackend({ filePath: TEST_FILE });
    await backend.writeAll({ $global: { openai: apiKey } });

    const raw = readFileSync(TEST_FILE, "utf-8");
    // Should be pretty-printed (not single line)
    expect(raw).toContain("\n");
    expect(JSON.parse(raw)).toEqual({ $global: { openai: apiKey } });
  });

  test("readAll handles all credential types", async () => {
    mkdirSync(TEST_DIR, { recursive: true });
    const backend = createJsonFileBackend({ filePath: TEST_FILE });
    const data: CredentialStoreData = {
      $global: {
        provider1: apiKey,
        provider2: oauthCred,
        provider3: customCred,
      },
    };
    await backend.writeAll(data);
    expect(await backend.readAll()).toEqual(data);
  });
});

// ---------------------------------------------------------------------------
// CredentialStore — basic operations
// ---------------------------------------------------------------------------

describe("CredentialStore", () => {
  describe("get / set", () => {
    test("get returns undefined for missing credential", async () => {
      const store = createCredentialStore({ backend: createMemoryBackend() });
      expect(await store.get("openai", "$global")).toBeUndefined();
    });

    test("set + get round-trips a credential", async () => {
      const store = createCredentialStore({ backend: createMemoryBackend() });
      await store.set("openai", "$global", apiKey);
      expect(await store.get("openai", "$global")).toEqual(apiKey);
    });

    test("set + get works for strategy scope", async () => {
      const store = createCredentialStore({ backend: createMemoryBackend() });
      await store.set("openai", "my-strategy", oauthCred);
      expect(await store.get("openai", "my-strategy")).toEqual(oauthCred);
      // Should NOT be in global scope
      expect(await store.get("openai", "$global")).toBeUndefined();
    });

    test("set overwrites existing credential", async () => {
      const store = createCredentialStore({ backend: createMemoryBackend() });
      await store.set("openai", "$global", apiKey);
      const newKey: Credential = { type: "api", key: "sk-new" };
      await store.set("openai", "$global", newKey);
      expect(await store.get("openai", "$global")).toEqual(newKey);
    });
  });

  describe("remove", () => {
    test("remove returns false for missing credential", async () => {
      const store = createCredentialStore({ backend: createMemoryBackend() });
      expect(await store.remove("openai", "$global")).toBe(false);
    });

    test("remove deletes existing credential", async () => {
      const store = createCredentialStore({ backend: createMemoryBackend() });
      await store.set("openai", "$global", apiKey);
      expect(await store.remove("openai", "$global")).toBe(true);
      expect(await store.get("openai", "$global")).toBeUndefined();
    });

    test("remove cleans up empty scopes", async () => {
      const store = createCredentialStore({ backend: createMemoryBackend() });
      await store.set("openai", "my-strategy", apiKey);
      await store.remove("openai", "my-strategy");
      expect(await store.listScopes()).toEqual([]);
    });

    test("remove does not affect other providers in same scope", async () => {
      const store = createCredentialStore({ backend: createMemoryBackend() });
      await store.set("openai", "$global", apiKey);
      await store.set("anthropic", "$global", oauthCred);
      await store.remove("openai", "$global");
      expect(await store.get("anthropic", "$global")).toEqual(oauthCred);
    });
  });

  describe("list", () => {
    test("list returns empty for missing scope", async () => {
      const store = createCredentialStore({ backend: createMemoryBackend() });
      expect(await store.list("$global")).toEqual([]);
    });

    test("list returns provider IDs for a scope", async () => {
      const store = createCredentialStore({ backend: createMemoryBackend() });
      await store.set("openai", "$global", apiKey);
      await store.set("anthropic", "$global", oauthCred);
      const providers = await store.list("$global");
      expect(providers.sort()).toEqual(["anthropic", "openai"]);
    });

    test("list only returns providers for the requested scope", async () => {
      const store = createCredentialStore({ backend: createMemoryBackend() });
      await store.set("openai", "$global", apiKey);
      await store.set("anthropic", "my-strategy", oauthCred);
      expect(await store.list("$global")).toEqual(["openai"]);
      expect(await store.list("my-strategy")).toEqual(["anthropic"]);
    });
  });

  describe("listScopes", () => {
    test("listScopes returns empty when no credentials exist", async () => {
      const store = createCredentialStore({ backend: createMemoryBackend() });
      expect(await store.listScopes()).toEqual([]);
    });

    test("listScopes returns all scopes with credentials", async () => {
      const store = createCredentialStore({ backend: createMemoryBackend() });
      await store.set("openai", "$global", apiKey);
      await store.set("anthropic", "strategy-a", oauthCred);
      await store.set("groq", "strategy-b", apiKey);
      const scopes = await store.listScopes();
      expect(scopes.sort()).toEqual(["$global", "strategy-a", "strategy-b"]);
    });
  });
});

// ---------------------------------------------------------------------------
// CredentialStore — resolution chain
// ---------------------------------------------------------------------------

describe("CredentialStore resolution", () => {
  test("resolve returns strategy-scoped credential first", async () => {
    const backend = createMemoryBackend({
      $global: { openai: { type: "api", key: "global-key" } },
      "my-strategy": { openai: { type: "api", key: "strategy-key" } },
    });
    const store = createCredentialStore({
      backend,
      env: { OPENAI_API_KEY: "env-key" },
    });
    const cred = await store.resolve("openai", "my-strategy");
    expect(cred).toEqual({ type: "api", key: "strategy-key" });
  });

  test("resolve falls back to env var when no strategy-scoped credential", async () => {
    const backend = createMemoryBackend({
      $global: { openai: { type: "api", key: "global-key" } },
    });
    const store = createCredentialStore({
      backend,
      env: { OPENAI_API_KEY: "env-key" },
    });
    const cred = await store.resolve("openai", "my-strategy");
    expect(cred).toEqual({ type: "api", key: "env-key" });
  });

  test("resolve falls back to global when no env var", async () => {
    const backend = createMemoryBackend({
      $global: { openai: { type: "api", key: "global-key" } },
    });
    const store = createCredentialStore({
      backend,
      env: {},
    });
    const cred = await store.resolve("openai", "my-strategy");
    expect(cred).toEqual({ type: "api", key: "global-key" });
  });

  test("resolve returns undefined when nothing is available", async () => {
    const store = createCredentialStore({
      backend: createMemoryBackend(),
      env: {},
    });
    expect(await store.resolve("openai", "my-strategy")).toBeUndefined();
  });

  test("resolve without scope skips strategy-scoped check", async () => {
    const backend = createMemoryBackend({
      $global: { openai: { type: "api", key: "global-key" } },
    });
    const store = createCredentialStore({ backend, env: {} });
    const cred = await store.resolve("openai");
    expect(cred).toEqual({ type: "api", key: "global-key" });
  });

  test("resolve with scope=$global skips strategy-scoped check", async () => {
    const backend = createMemoryBackend({
      $global: { openai: { type: "api", key: "global-key" } },
    });
    const store = createCredentialStore({
      backend,
      env: { OPENAI_API_KEY: "env-key" },
    });
    // $global scope should NOT be treated as a strategy scope override,
    // so it should hit env var first, then global.
    const cred = await store.resolve("openai", "$global");
    expect(cred).toEqual({ type: "api", key: "env-key" });
  });

  test("resolve uses well-known env vars for common providers", async () => {
    const store = createCredentialStore({
      backend: createMemoryBackend(),
      env: { ANTHROPIC_API_KEY: "sk-ant-test" },
    });
    const cred = await store.resolve("anthropic");
    expect(cred).toEqual({ type: "api", key: "sk-ant-test" });
  });

  test("resolve tries all aliases in env var map", async () => {
    // Google has two aliases: GOOGLE_GENERATIVE_AI_API_KEY and GOOGLE_API_KEY
    const store = createCredentialStore({
      backend: createMemoryBackend(),
      env: { GOOGLE_API_KEY: "google-key" }, // second alias
    });
    const cred = await store.resolve("google");
    expect(cred).toEqual({ type: "api", key: "google-key" });
  });

  test("resolve prefers first env var alias over second", async () => {
    const store = createCredentialStore({
      backend: createMemoryBackend(),
      env: {
        GOOGLE_GENERATIVE_AI_API_KEY: "primary-key",
        GOOGLE_API_KEY: "secondary-key",
      },
    });
    const cred = await store.resolve("google");
    expect(cred).toEqual({ type: "api", key: "primary-key" });
  });

  test("resolve ignores empty env var values", async () => {
    const backend = createMemoryBackend({
      $global: { openai: { type: "api", key: "global-key" } },
    });
    const store = createCredentialStore({
      backend,
      env: { OPENAI_API_KEY: "" },
    });
    const cred = await store.resolve("openai");
    expect(cred).toEqual({ type: "api", key: "global-key" });
  });

  test("resolve with custom env var overrides", async () => {
    const store = createCredentialStore({
      backend: createMemoryBackend(),
      envVarOverrides: { "my-provider": ["MY_CUSTOM_KEY"] },
      env: { MY_CUSTOM_KEY: "custom-key" },
    });
    const cred = await store.resolve("my-provider");
    expect(cred).toEqual({ type: "api", key: "custom-key" });
  });

  test("envVarOverrides override well-known entries", async () => {
    const store = createCredentialStore({
      backend: createMemoryBackend(),
      envVarOverrides: { openai: ["MY_OPENAI_KEY"] }, // override default OPENAI_API_KEY
      env: { OPENAI_API_KEY: "default-key", MY_OPENAI_KEY: "override-key" },
    });
    const cred = await store.resolve("openai");
    expect(cred).toEqual({ type: "api", key: "override-key" });
  });
});

// ---------------------------------------------------------------------------
// WELL_KNOWN_ENV_VARS sanity checks
// ---------------------------------------------------------------------------

describe("WELL_KNOWN_ENV_VARS", () => {
  test("contains expected providers", () => {
    expect(WELL_KNOWN_ENV_VARS.openai).toEqual(["OPENAI_API_KEY"]);
    expect(WELL_KNOWN_ENV_VARS.anthropic).toEqual(["ANTHROPIC_API_KEY"]);
    expect(WELL_KNOWN_ENV_VARS.google).toContain("GOOGLE_GENERATIVE_AI_API_KEY");
  });

  test("all entries are non-empty arrays of strings", () => {
    for (const [provider, vars] of Object.entries(WELL_KNOWN_ENV_VARS)) {
      expect(Array.isArray(vars)).toBe(true);
      expect(vars.length).toBeGreaterThan(0);
      for (const v of vars) {
        expect(typeof v).toBe("string");
        expect(v.length).toBeGreaterThan(0);
      }
    }
  });
});
