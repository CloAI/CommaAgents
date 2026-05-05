import { afterEach, describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { createJsonFileBackend } from "../credentials/backends/json-file";
import { createCredentialStore } from "../credentials/credentials";
import { registerProvider, resetGlobalDefaults } from "../defaults/defaults";
import { resetProviderRegistry } from "./providers/providers";
import { registerProviderDefinition } from "./providers/index";
import { getProviderInfo, listProviders } from "./model.utils";

const TEST_DIR = join(import.meta.dir, "__test_providers__");
const TEST_FILE = join(TEST_DIR, "credentials.json");

function cleanup() {
  if (existsSync(TEST_DIR)) rmSync(TEST_DIR, { recursive: true, force: true });
}

afterEach(() => {
  cleanup();
  resetGlobalDefaults();
  resetProviderRegistry();
});

describe("listProviders", () => {
  test("includes catalog-derived providers", async () => {
    mkdirSync(TEST_DIR, { recursive: true });
    const backend = createJsonFileBackend({ filePath: TEST_FILE });
    const store = createCredentialStore({ backend, env: {} });

    const providers = await listProviders(store);

    const providerIds = providers.map((provider) => provider.id);
    expect(providerIds).toContain("openai");
    expect(providerIds).toContain("anthropic");
    expect(providerIds).toContain("github-copilot");
  });

  test("includes built-in override providers (ollama)", async () => {
    mkdirSync(TEST_DIR, { recursive: true });
    const backend = createJsonFileBackend({ filePath: TEST_FILE });
    const store = createCredentialStore({ backend, env: {} });

    const providers = await listProviders(store);
    const providerIds = providers.map((provider) => provider.id);
    expect(providerIds).toContain("ollama");
  });

  test("returns providers sorted alphabetically", async () => {
    mkdirSync(TEST_DIR, { recursive: true });
    const backend = createJsonFileBackend({ filePath: TEST_FILE });
    const store = createCredentialStore({ backend, env: {} });

    const providers = await listProviders(store);
    const ids = providers.map((provider) => provider.id);
    const sorted = [...ids].sort();
    expect(ids).toEqual(sorted);
  });

  test("marks providers as 'configured' when env var is set", async () => {
    mkdirSync(TEST_DIR, { recursive: true });
    const backend = createJsonFileBackend({ filePath: TEST_FILE });
    const store = createCredentialStore({
      backend,
      env: { OPENAI_API_KEY: "sk-env" },
    });

    const providers = await listProviders(store);
    const openai = providers.find((provider) => provider.id === "openai");
    const anthropic = providers.find((provider) => provider.id === "anthropic");
    expect(openai?.authStatus).toBe("configured");
    expect(anthropic?.authStatus).toBe("none");
  });

  test("includes custom registered providers", async () => {
    mkdirSync(TEST_DIR, { recursive: true });
    registerProvider("my-custom", {
      factory: () => () => ({}) as never,
    });
    registerProviderDefinition({ id: "my-custom", name: "My Custom" });

    const backend = createJsonFileBackend({ filePath: TEST_FILE });
    const store = createCredentialStore({ backend, env: {} });

    const providers = await listProviders(store);
    const custom = providers.find((provider) => provider.id === "my-custom");
    expect(custom).toBeDefined();
    expect(custom?.isCustom).toBe(true);
    expect(custom?.models).toEqual([]);
  });

  test("populates catalog model metadata for known providers", async () => {
    mkdirSync(TEST_DIR, { recursive: true });
    const backend = createJsonFileBackend({ filePath: TEST_FILE });
    const store = createCredentialStore({ backend, env: {} });

    const providers = await listProviders(store);
    const openai = providers.find((provider) => provider.id === "openai");
    expect(openai?.models.length).toBeGreaterThan(0);
    expect(openai?.modelsSource).toBe("catalog");
    const modelIds = openai?.models.map((model) => model.id) ?? [];
    expect(modelIds.length).toBeGreaterThan(0);
    // Every model should have a string id
    expect(openai?.models.every((model) => typeof model.id === "string")).toBe(true);
  });
});

describe("getProviderInfo", () => {
  test("returns info for a single provider", async () => {
    mkdirSync(TEST_DIR, { recursive: true });
    const backend = createJsonFileBackend({ filePath: TEST_FILE });
    const store = createCredentialStore({
      backend,
      env: { ANTHROPIC_API_KEY: "sk-a" },
    });

    const info = await getProviderInfo("anthropic", store);
    expect(info.id).toBe("anthropic");
    expect(info.authStatus).toBe("configured");
    expect(info.isCustom).toBe(false);
    expect(info.models.length).toBeGreaterThan(0);
    expect(info.modelsSource).toBe("catalog");
  });

  test("uses catalog display name when available", async () => {
    mkdirSync(TEST_DIR, { recursive: true });
    const backend = createJsonFileBackend({ filePath: TEST_FILE });
    const store = createCredentialStore({ backend, env: {} });

    const info = await getProviderInfo("github-copilot", store);
    // Catalog-provided name wins over formatProviderName fallback.
    expect(info.name).toBeDefined();
    expect(info.name.length).toBeGreaterThan(0);
  });
});
