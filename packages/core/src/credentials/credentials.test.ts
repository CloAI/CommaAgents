// Tests for the credential store: JsonFileBackend + createCredentialStore.

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { createJsonFileCredentialBackend } from "./backends/json-file";
import { createCredentialStore } from "./credentials";
import { WELL_KNOWN_ENV_VARS } from "./credentials.constants";
import type { Credential } from "./credentials.schema";
import type {
  CredentialBackend,
  CredentialStoreData,
} from "./credentials.types";

// Test helpers

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

/**
 * In-memory backend for store tests (avoids filesystem coupling).
 * @param {CredentialStoreData} initial - Initial credential data copied into memory.
 * @returns {CredentialBackend} A backend that copies data on reads and writes.
 */
function createMemoryBackend(
  initial: CredentialStoreData = {},
): CredentialBackend {
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

// JsonFileBackend

describe("JsonFileBackend", () => {
  beforeEach(cleanup);
  afterEach(cleanup);

  test("readAll returns empty object when file does not exist", async () => {
    const backend = createJsonFileCredentialBackend({ filePath: TEST_FILE });
    expect(await backend.readAll()).toEqual({});
  });

  test("writeAll creates parent directories", async () => {
    const nested = join(TEST_DIR, "deep", "nested", "credentials.json");
    const backend = createJsonFileCredentialBackend({ filePath: nested });
    await backend.writeAll({ $global: { openai: apiKey } });
    expect(existsSync(nested)).toBe(true);
  });

  test("writeAll + readAll round-trips data", async () => {
    mkdirSync(TEST_DIR, { recursive: true });
    const backend = createJsonFileCredentialBackend({ filePath: TEST_FILE });

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
    const backend = createJsonFileCredentialBackend({ filePath: TEST_FILE });
    await backend.writeAll({ $global: { openai: apiKey } });

    const stats = statSync(TEST_FILE);
    // mode includes file type bits; mask to get permission bits only
    const perms = stats.mode & 0o777;
    expect(perms).toBe(0o600);
  });

  test("readAll rejects empty files", async () => {
    mkdirSync(TEST_DIR, { recursive: true });
    writeFileSync(TEST_FILE, "", "utf-8");
    const backend = createJsonFileCredentialBackend({ filePath: TEST_FILE });
    await expect(backend.readAll()).rejects.toMatchObject({
      code: "CREDENTIAL_STORAGE_ERROR",
    });
  });

  test("readAll rejects invalid JSON", async () => {
    mkdirSync(TEST_DIR, { recursive: true });
    writeFileSync(TEST_FILE, "not-json{{{", "utf-8");
    const backend = createJsonFileCredentialBackend({ filePath: TEST_FILE });
    await expect(backend.readAll()).rejects.toMatchObject({
      code: "CREDENTIAL_STORAGE_ERROR",
    });
  });

  test("readAll rejects valid JSON with invalid credential schema", async () => {
    mkdirSync(TEST_DIR, { recursive: true });
    // Valid JSON but wrong shape — credentials should have a type field
    writeFileSync(
      TEST_FILE,
      JSON.stringify({ $global: { openai: "just-a-string" } }),
      "utf-8",
    );
    const backend = createJsonFileCredentialBackend({ filePath: TEST_FILE });
    await expect(backend.readAll()).rejects.toMatchObject({
      code: "CREDENTIAL_STORAGE_ERROR",
    });
  });

  test("unreadable storage fails safely instead of returning empty data", async () => {
    mkdirSync(TEST_FILE, { recursive: true });
    const backend = createJsonFileCredentialBackend({ filePath: TEST_FILE });
    await expect(backend.readAll()).rejects.toMatchObject({
      code: "CREDENTIAL_STORAGE_ERROR",
      message: "Unable to read credential storage.",
    });
  });

  test.each(["", "not-json-secret-key", '{"$global":{"openai":"secret-key"}}'])(
    "failed mutation preserves invalid storage: %s",
    async (contents) => {
      mkdirSync(TEST_DIR, { recursive: true });
      writeFileSync(TEST_FILE, contents);
      const store = createCredentialStore({
        backend: createJsonFileCredentialBackend({ filePath: TEST_FILE }),
        env: {},
      });
      await expect(
        store.set("openai", "$global", apiKey),
      ).rejects.toMatchObject({
        code: "CREDENTIAL_STORAGE_ERROR",
        message: "Unable to read credential storage.",
      });
      await expect(store.remove("openai", "$global")).rejects.toMatchObject({
        code: "CREDENTIAL_STORAGE_ERROR",
      });
      expect(readFileSync(TEST_FILE, "utf8")).toBe(contents);
    },
  );

  test("invalid writes preserve existing storage and do not expose credential data", async () => {
    const backend = createJsonFileCredentialBackend({ filePath: TEST_FILE });
    await backend.writeAll({ $global: { openai: apiKey } });
    const previousContents = readFileSync(TEST_FILE, "utf8");
    await expect(
      backend.writeAll({
        $global: { openai: { type: "secret-key" } },
      } as unknown as CredentialStoreData),
    ).rejects.toMatchObject({
      code: "CREDENTIAL_STORAGE_ERROR",
      message: "Unable to write credential storage.",
    });
    expect(readFileSync(TEST_FILE, "utf8")).toBe(previousContents);
  });

  test("writeAll validates data before writing", async () => {
    mkdirSync(TEST_DIR, { recursive: true });
    const backend = createJsonFileCredentialBackend({ filePath: TEST_FILE });
    // Pass invalid data — should throw
    await expect(
      backend.writeAll({
        $global: { openai: { type: "invalid" } },
      } as unknown as CredentialStoreData),
    ).rejects.toThrow();
  });

  test("writeAll produces readable JSON", async () => {
    mkdirSync(TEST_DIR, { recursive: true });
    const backend = createJsonFileCredentialBackend({ filePath: TEST_FILE });
    await backend.writeAll({ $global: { openai: apiKey } });

    const raw = readFileSync(TEST_FILE, "utf-8");
    // Should be pretty-printed (not single line)
    expect(raw).toContain("\n");
    expect(JSON.parse(raw)).toEqual({ $global: { openai: apiKey } });
  });

  test("readAll handles all credential types", async () => {
    mkdirSync(TEST_DIR, { recursive: true });
    const backend = createJsonFileCredentialBackend({ filePath: TEST_FILE });
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

// CredentialStore — basic operations

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

// CredentialStore — resolution chain

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

// WELL_KNOWN_ENV_VARS sanity checks

describe("WELL_KNOWN_ENV_VARS", () => {
  test("contains expected providers", () => {
    expect(WELL_KNOWN_ENV_VARS.openai).toEqual(["OPENAI_API_KEY"]);
    expect(WELL_KNOWN_ENV_VARS.anthropic).toEqual(["ANTHROPIC_API_KEY"]);
    expect(WELL_KNOWN_ENV_VARS.google).toContain(
      "GOOGLE_GENERATIVE_AI_API_KEY",
    );
  });

  test("all entries are non-empty arrays of strings", () => {
    for (const [_provider, vars] of Object.entries(WELL_KNOWN_ENV_VARS)) {
      expect(Array.isArray(vars)).toBe(true);
      expect(vars.length).toBeGreaterThan(0);
      for (const varEntry of vars) {
        expect(typeof varEntry).toBe("string");
        expect(varEntry.length).toBeGreaterThan(0);
      }
    }
  });
});

// getAuthStatus

describe("getAuthStatus", () => {
  beforeEach(() => {
    cleanup();
    mkdirSync(TEST_DIR, { recursive: true });
  });
  afterEach(cleanup);

  test("returns 'none' when no credential exists in any source", async () => {
    const backend = createJsonFileCredentialBackend({ filePath: TEST_FILE });
    const store = createCredentialStore({ backend, env: {} });
    expect(await store.getAuthStatus("openai")).toBe("none");
  });

  test("returns 'configured' when env var is set", async () => {
    const backend = createJsonFileCredentialBackend({ filePath: TEST_FILE });
    const store = createCredentialStore({
      backend,
      env: { OPENAI_API_KEY: "sk-env" },
    });
    expect(await store.getAuthStatus("openai")).toBe("configured");
  });

  test("returns 'configured' when global-scope credential exists", async () => {
    const backend = createJsonFileCredentialBackend({ filePath: TEST_FILE });
    const store = createCredentialStore({ backend, env: {} });
    await store.set("anthropic", "$global", { type: "api", key: "sk-a" });
    expect(await store.getAuthStatus("anthropic")).toBe("configured");
  });

  test("returns 'configured' when strategy-scoped credential exists", async () => {
    const backend = createJsonFileCredentialBackend({ filePath: TEST_FILE });
    const store = createCredentialStore({ backend, env: {} });
    await store.set("openai", "my-strategy", { type: "api", key: "sk-s" });
    expect(await store.getAuthStatus("openai", "my-strategy")).toBe(
      "configured",
    );
    // Without scope, still 'none' because strategy-scoped requires scope match.
    expect(await store.getAuthStatus("openai")).toBe("none");
  });
});

describe("global credential source", () => {
  test("reports effective source without exposing credentials and respects env overrides", async () => {
    const environment: Record<string, string | undefined> = {
      CUSTOM_KEY: "environment-secret",
    };
    const store = createCredentialStore({
      backend: createMemoryBackend({
        $global: { openai: apiKey },
        strategy: { anthropic: oauthCred },
      }),
      env: environment,
      envVarOverrides: { openai: ["CUSTOM_KEY"] },
    });
    expect(await store.getSource("openai")).toBe("environment");
    expect(await store.getSource("anthropic")).toBe("none");
    expect(await store.resolve("anthropic", "strategy")).toEqual(oauthCred);
    environment.CUSTOM_KEY = "";
    expect(await store.getSource("openai")).toBe("global");
    await store.remove("openai", "$global");
    expect(await store.getSource("openai")).toBe("none");
  });

  test("recognizes environment aliases", async () => {
    const store = createCredentialStore({
      backend: createMemoryBackend(),
      env: { GOOGLE_API_KEY: "alias-key" },
    });
    expect(await store.getSource("google")).toBe("environment");
  });
});

describe("credential mutation ordering", () => {
  test("concurrent mutations retain unrelated credentials in invocation order", async () => {
    const store = createCredentialStore({
      backend: createMemoryBackend(),
      env: {},
    });
    await Promise.all([
      store.set("openai", "$global", apiKey),
      store.set("anthropic", "$global", oauthCred),
      store.remove("openai", "$global"),
      store.set("groq", "strategy", apiKey),
      store.set("openai", "$global", customCred),
    ]);
    expect(await store.get("openai", "$global")).toEqual(customCred);
    expect(await store.get("anthropic", "$global")).toEqual(oauthCred);
    expect(await store.get("groq", "strategy")).toEqual(apiKey);
  });

  test("failed writes are safe and do not poison subsequent queued mutations", async () => {
    const memory = createMemoryBackend({ $global: { openai: apiKey } });
    let failWrite = true;
    const store = createCredentialStore({
      backend: {
        readAll: memory.readAll,
        async writeAll(data) {
          if (failWrite) {
            failWrite = false;
            throw new Error("secret-key-in-backend-error");
          }
          await memory.writeAll(data);
        },
      },
      env: {},
    });
    const removal = store.remove("openai", "$global");
    const save = store.set("anthropic", "$global", oauthCred);
    await expect(removal).rejects.toMatchObject({
      code: "CREDENTIAL_STORAGE_ERROR",
      message: "Unable to write credential storage.",
    });
    await save;
    expect(await store.get("openai", "$global")).toEqual(apiKey);
    expect(await store.get("anthropic", "$global")).toEqual(oauthCred);
  });

  test("failed reads cannot leak backend errors and the queue recovers", async () => {
    const memory = createMemoryBackend();
    let failRead = true;
    const store = createCredentialStore({
      backend: {
        async readAll() {
          if (failRead) {
            failRead = false;
            throw new Error("secret-key-in-read-error");
          }
          return memory.readAll();
        },
        writeAll: memory.writeAll,
      },
    });
    const failure = store.set("openai", "$global", apiKey);
    const success = store.set("anthropic", "$global", oauthCred);
    await expect(failure).rejects.toMatchObject({
      code: "CREDENTIAL_STORAGE_ERROR",
      message: "Unable to read credential storage.",
    });
    await success;
    expect(await store.get("anthropic", "$global")).toEqual(oauthCred);
  });
});

describe("conditional credential replacement", () => {
  test("should never restore credentials removed while a refresh was pending", async () => {
    const store = createCredentialStore({
      backend: createMemoryBackend(),
      env: {},
    });
    await store.set("openai", "$global", apiKey);
    const previous = await store.get("openai", "$global");
    await store.remove("openai", "$global");
    await expect(
      store.set("openai", "$global", oauthCred, previous!),
    ).rejects.toMatchObject({ code: "CREDENTIAL_CHANGED" });
    expect(await store.get("openai", "$global")).toBeUndefined();
    await store.set("openai", "$global", oauthCred, null);
    expect(await store.get("openai", "$global")).toEqual(oauthCred);
  });
});
