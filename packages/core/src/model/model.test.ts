import { afterEach, describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import type { LanguageModel } from "ai";
import { createJsonFileBackend } from "../credentials/backends/json-file";
import { createCredentialStore } from "../credentials/credentials";
import {
  registerProvider,
  resetGlobalDefaults,
  setGlobalCredentialStore,
} from "../defaults/defaults";
import {
  registerModel,
  resetModelRegistry,
  resolveModel,
} from "./model";
import {
  getProvidersForModel,
  getReverseModelIndex,
} from "./providers/catalog/catalog";
import {
  getModelCapabilities,
  getModelMetadata,
  getProviderInfo,
  listProviders,
} from "./model.utils";
import { registerProviderDefinition } from "./providers/index";
import { resetProviderRegistry } from "./providers/providers";
import { resetCatalog } from "./providers/catalog/catalog";

const TEST_DIR = join(import.meta.dir, "__test_providers__");
const TEST_FILE = join(TEST_DIR, "credentials.json");

function cleanup() {
  if (existsSync(TEST_DIR)) rmSync(TEST_DIR, { recursive: true, force: true });
}

afterEach(() => {
  cleanup();
  resetGlobalDefaults();
  resetProviderRegistry();
  resetCatalog();
  resetModelRegistry();
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
    expect(openai?.models.every((model) => typeof model.id === "string")).toBe(
      true,
    );
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

describe("getReverseModelIndex", () => {
  test("indexes catalog models to their provider IDs", () => {
    const index = getReverseModelIndex();
    expect(index.size).toBeGreaterThan(0);
    // "gpt-4o" should map to at least one provider
    const providers = index.get("gpt-4o");
    expect(providers).toBeDefined();
    expect(providers!.length).toBeGreaterThan(0);
    expect(providers).toEqual([...providers!].sort());
  });
});

describe("getProvidersForModel", () => {
  test("returns provider IDs for a known catalog model", () => {
    const providers = getProvidersForModel("gpt-4o");
    expect(providers.length).toBeGreaterThan(0);
    expect(providers[0]).toBeString();
  });

  test("returns empty array for unknown model", () => {
    const providers = getProvidersForModel("nonexistent-model-xyz-12345");
    expect(providers).toEqual([]);
  });
});

describe("getModelMetadata", () => {
  test("returns capabilities for a known catalog model", () => {
    const caps = getModelCapabilities("gpt-4o");
    expect(caps).toBeDefined();
    // gpt-4o should at minimum report tools support
    expect(caps!.tools).toBe(true);
  });

  test("returns undefined for an unknown model", () => {
    const caps = getModelCapabilities("nonexistent-model-xyz-12345");
    expect(caps).toBeUndefined();
  });

  test("returns full metadata for a known model", () => {
    const info = getModelMetadata("gpt-4o");
    expect(info).toBeDefined();
    expect(info!.id).toBe("gpt-4o");
    expect(info!.capabilities).toBeDefined();
    expect(info!.contextWindow).toBeGreaterThan(0);
  });
});

describe("resolveModel", () => {
  test("resolves explicit provider/model format", async () => {
    const mockModel = {} as LanguageModel;
    registerModel("openai/gpt-4o", mockModel);

    const result = await resolveModel("openai/gpt-4o");
    expect(result).toBe(mockModel);
  });

  test("auto-resolves bare model ID when credentials are configured", async () => {
    mkdirSync(TEST_DIR, { recursive: true });
    const backend = createJsonFileBackend({ filePath: TEST_FILE });
    const store = createCredentialStore({
      backend,
      env: { OPENAI_API_KEY: "sk-test" },
    });
    setGlobalCredentialStore(store);

    const mockModel = {} as LanguageModel;
    registerProvider("openai", {
      factory: () => (modelId: string) => {
        expect(modelId).toBe("gpt-4o");
        return mockModel;
      },
    });

    const result = await resolveModel("gpt-4o");
    expect(result).toBe(mockModel);
  });

  test("registered model takes precedence over auto-resolution", async () => {
    mkdirSync(TEST_DIR, { recursive: true });
    const backend = createJsonFileBackend({ filePath: TEST_FILE });
    const store = createCredentialStore({
      backend,
      env: { OPENAI_API_KEY: "sk-test" },
    });
    setGlobalCredentialStore(store);

    const directMock = {} as LanguageModel;
    registerModel("gpt-4o", directMock);

    const providerMock = {} as LanguageModel;
    registerProvider("openai", {
      factory: () => () => providerMock,
    });

    const result = await resolveModel("gpt-4o");
    expect(result).toBe(directMock);
  });

  test("trims whitespace from model string", async () => {
    const mockModel = {} as LanguageModel;
    registerModel("openai/gpt-4o", mockModel);

    const result = await resolveModel("  openai/gpt-4o  ");
    expect(result).toBe(mockModel);
  });

  test("throws for empty model string", async () => {
    await expect(resolveModel("")).rejects.toThrow("cannot be empty");
    await expect(resolveModel("   ")).rejects.toThrow("cannot be empty");
  });

  test("throws when bare model is not in any provider catalog", async () => {
    await expect(
      resolveModel("nonexistent-model-xyz-12345"),
    ).rejects.toThrow("not listed by any known provider");
  });

  test("throws when bare model has catalog matches but no credentials", async () => {
    // Ensure no env vars are set
    const backend = createJsonFileBackend({ filePath: TEST_FILE });
    const store = createCredentialStore({ backend, env: {} });
    setGlobalCredentialStore(store);

    await expect(resolveModel("gpt-4o")).rejects.toThrow(
      "no credentials are configured",
    );
  });
});
