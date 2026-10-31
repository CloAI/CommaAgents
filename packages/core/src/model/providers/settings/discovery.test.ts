import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  createCredentialStore,
  getGlobalCredentialStore,
  setGlobalCredentialStore,
} from "../../../credentials";
import {
  getCatalogCachePath,
  getProviderSettingsPath,
  setCatalogCachePath,
  setProviderSettingsPath,
} from "../../../defaults/defaults";
import { getProviderInfo, listProviders } from "../../model.utils";
import { getCatalogSnapshot, resetCatalog } from "../catalog";
import {
  listProviderModels,
  registerProviderDefinition,
  resetProviderRegistry,
} from "../providers";
import { addCustomProviderModel } from "./settings.api";

const originalFetch = globalThis.fetch;
const originalSettingsPath = getProviderSettingsPath();
const originalCatalogPath = getCatalogCachePath();
const originalStore = getGlobalCredentialStore();
const catalog = getCatalogSnapshot();
const store = createCredentialStore({
  backend: {
    async readAll() {
      return {};
    },
    async writeAll() {},
  },
  env: {},
});
let testDirectory: string;

beforeEach(async () => {
  testDirectory = mkdtempSync(join(tmpdir(), "comma-discovery-"));
  setProviderSettingsPath(join(testDirectory, "settings.json"));
  setCatalogCachePath(join(testDirectory, "catalog.json"));
  writeFileSync(
    getCatalogCachePath(),
    JSON.stringify({ fetchedAt: Date.now(), data: catalog }),
  );
  resetCatalog();
  resetProviderRegistry();
  setGlobalCredentialStore(store);
  globalThis.fetch = mock(async () => {
    throw new Error("Unexpected network access");
  }) as unknown as typeof fetch;
  // Initialize before overriding a known provider, preserving the core-owned built-ins.
  await getProviderInfo("openai", store);
});

afterEach(() => {
  globalThis.fetch = originalFetch;
  setGlobalCredentialStore(originalStore);
  setProviderSettingsPath(originalSettingsPath);
  setCatalogCachePath(originalCatalogPath);
  resetProviderRegistry();
  resetCatalog();
  rmSync(testDirectory, { recursive: true, force: true });
});

describe("provider discovery results", () => {
  test("successful empty live discovery falls back to catalog with an explicit empty status", async () => {
    const baseline = await listProviderModels("openai", undefined, {
      live: false,
    });
    const listModels = mock(async () => []);
    registerProviderDefinition({
      id: "openai",
      name: "OpenAI",
      credentialType: "none",
      listModels,
    });
    const result = await listProviderModels("openai", undefined, {
      live: true,
    });
    expect(listModels).toHaveBeenCalledTimes(1);
    expect(result.models).toEqual(baseline.models);
    expect(
      result.models.every((model) => model.sources.includes("models.dev")),
    ).toBe(true);
    expect(result.discovery?.status).toBe("empty");
    expect(result.discovery.fetchedAt).toBeString();
  });

  test("manual and catalog-only IDs survive nonempty live discovery", async () => {
    const baseline = await listProviderModels("openai", undefined, {
      live: false,
    });
    const included = baseline.models[0]!;
    const excluded = baseline.models[1]!;
    await addCustomProviderModel({
      providerId: "openai",
      modelId: "manual-only",
    });
    registerProviderDefinition({
      id: "openai",
      name: "OpenAI",
      credentialType: "none",
      listModels: async () => [
        { id: included.id, sources: ["provider"], metadata: {} },
      ],
    });
    const result = await listProviderModels("openai", undefined, {
      live: true,
    });
    expect(result.models.map((model) => model.id).sort()).toEqual(
      [...baseline.models.map((model) => model.id), "manual-only"].sort(),
    );
    expect(result.models.find((model) => model.id === included.id)).toEqual({
      ...included,
      sources: ["provider", "models.dev"],
    });
    expect(result.models.find((model) => model.id === excluded.id)).toEqual(
      excluded,
    );
    expect(
      result.models.find((model) => model.id === "manual-only"),
    ).toMatchObject({ sources: ["user"] });
    expect(result.discovery?.status).toBe("live");
  });

  test("live discovery failures return safe errors without raw exception details", async () => {
    registerProviderDefinition({
      id: "openai",
      name: "OpenAI",
      credentialType: "none",
      async listModels() {
        throw new Error(
          "Authorization: Bearer secret-key; raw provider payload",
        );
      },
    });
    const result = await listProviderModels("openai", undefined, {
      live: true,
    });
    expect(result.discovery.error).toBe("Live model discovery failed.");
    expect(result.discovery?.status).toBe("error");
    expect(result.models.length).toBeGreaterThan(0);
    expect(JSON.stringify(result)).not.toContain("secret-key");
    expect(JSON.stringify(result)).not.toContain("raw provider payload");
  });

  test("manual metadata fills only missing discovery fields, including each nested field", async () => {
    registerProviderDefinition({
      id: "runtime-metadata",
      name: "Metadata",
      credentialType: "none",
      listModels: async () => [
        {
          id: "known",
          sources: ["provider"],
          metadata: {
            name: "Live name",
            contextWindow: 0,
            capabilities: { tools: false, reasoning: true },
            modalities: { input: [] },
            cost: { input: 0, cacheRead: 0.25 },
          },
        },
      ],
    });
    await addCustomProviderModel({
      providerId: "runtime-metadata",
      modelId: "known",
      metadata: {
        name: "Manual name",
        family: "manual-family",
        contextWindow: 999,
        maxOutputTokens: 42,
        capabilities: { tools: true, vision: true },
        modalities: { input: ["image"], output: ["text"] },
        cost: { input: 10, output: 20, cacheRead: 9, cacheWrite: 5 },
      },
    });
    const result = await listProviderModels("runtime-metadata", undefined, {
      live: true,
    });
    expect(result.models).toEqual([
      {
        id: "known",
        sources: ["provider", "user"],
        metadata: {
          name: "Live name",
          family: "manual-family",
          contextWindow: 0,
          maxOutputTokens: 42,
          capabilities: { tools: false, reasoning: true, vision: true },
          modalities: { input: [], output: ["text"] },
          cost: { input: 0, output: 20, cacheRead: 0.25, cacheWrite: 5 },
        },
      },
    ]);
    expect(result.models[0]?.sources).toEqual(["provider", "user"]);
  });

  test("default discovery makes no provider live requests", async () => {
    const listModels = mock(async () => [
      { id: "must-not-run", sources: ["provider"] as const, metadata: {} },
    ]);
    registerProviderDefinition({
      id: "openai",
      name: "OpenAI",
      credentialType: "none",
      listModels,
    });
    const single = await getProviderInfo("openai", store);
    const providers = await listProviders(store);
    expect(single.discovery?.status).toBe("catalog_only");
    expect(
      providers.find((provider) => provider.id === "openai")?.discovery?.status,
    ).toBe("catalog_only");
    expect(listModels).not.toHaveBeenCalled();
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });
});
