import { afterEach, beforeEach, describe, expect, vi, test } from "vitest";
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
import { refreshAndListProviderModels } from "../test.utils";
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
  globalThis.fetch = vi.fn(async () => {
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
  test("an empty provider listing falls back to the catalog", async () => {
    const baseline = await listProviderModels("openai");
    const listModels = vi.fn(async () => []);
    registerProviderDefinition({
      id: "openai",
      name: "OpenAI",
      credentialType: "none",
      listModels,
    });
    const result = await refreshAndListProviderModels("openai");
    expect(listModels).toHaveBeenCalledTimes(1);
    expect(result).toEqual(baseline);
    expect(result.every((model) => model.sources.includes("models.dev"))).toBe(
      true,
    );
  });

  test("manual and catalog-only IDs survive a nonempty provider listing", async () => {
    const baseline = await listProviderModels("openai");
    const included = baseline[0]!;
    const excluded = baseline[1]!;
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
    const result = await refreshAndListProviderModels("openai");
    expect(result.map((model) => model.id).sort()).toEqual(
      [...baseline.map((model) => model.id), "manual-only"].sort(),
    );
    expect(result.find((model) => model.id === included.id)).toEqual({
      ...included,
      sources: ["provider", "models.dev"],
    });
    expect(result.find((model) => model.id === excluded.id)).toEqual(excluded);
    expect(result.find((model) => model.id === "manual-only")).toMatchObject({
      sources: ["user"],
    });
  });

  test("provider listing failures fall back to the catalog without leaking details", async () => {
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
    const result = await refreshAndListProviderModels("openai");
    expect(result.length).toBeGreaterThan(0);
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
    const result = await refreshAndListProviderModels("runtime-metadata");
    expect(result).toEqual([
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
    expect(result[0]?.sources).toEqual(["provider", "user"]);
  });

  test("listing providers makes no provider requests", async () => {
    const listModels = vi.fn(async () => [
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
    expect(single.models.map((model) => model.id)).not.toContain(
      "must-not-run",
    );
    expect(providers.some((provider) => provider.id === "openai")).toBe(true);
    expect(listModels).not.toHaveBeenCalled();
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });
});
