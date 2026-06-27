import { afterEach, describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { createJsonFileBackend } from "../../credentials/backends/json-file";
import { createCredentialStore } from "../../credentials/credentials";
import {
  getProviderDefinition,
  listAllProviderModels,
  listProviderDefinitions,
  listProviderModels,
  registerProviderDefinition,
  resetProviderRegistry,
  unregisterProviderDefinition,
} from "./providers";
import type { ModelInfo } from "./providers.types";
import { mergeCatalogWithLive, mergeModelInfo } from "./providers.utils";

const TEST_DIR = join(import.meta.dir, "__test_providers_registry__");
const TEST_FILE = join(TEST_DIR, "credentials.json");

afterEach(() => {
  resetProviderRegistry();
  if (existsSync(TEST_DIR)) rmSync(TEST_DIR, { recursive: true, force: true });
});

describe("provider registry", () => {
  test("auto-registers catalog providers on first access", async () => {
    const definitions = await listProviderDefinitions();
    const ids = definitions.map((def) => def.id);
    expect(ids).toContain("openai");
    expect(ids).toContain("anthropic");
    expect(ids).toContain("github-copilot");
    expect(ids).toContain("ollama");
  });

  test("ollama and github-copilot have listModels attached", async () => {
    const ollama = await getProviderDefinition("ollama");
    const copilot = await getProviderDefinition("github-copilot");
    expect(typeof ollama?.listModels).toBe("function");
    expect(typeof copilot?.listModels).toBe("function");
  });

  test("registerProviderDefinition overrides catalog entries and marks custom", async () => {
    registerProviderDefinition({
      id: "openai",
      name: "My OpenAI",
      packageName: "custom-pkg",
    });
    const def = await getProviderDefinition("openai");
    expect(def?.name).toBe("My OpenAI");
    expect(def?.isCustom).toBe(true);
  });

  test("unregisterProviderDefinition removes the entry", () => {
    registerProviderDefinition({ id: "zzz-custom", name: "Zed" });
    expect(unregisterProviderDefinition("zzz-custom")).toBe(true);
    expect(unregisterProviderDefinition("zzz-custom")).toBe(false);
  });

  test("unregisterProviderDefinition restores catalog providers", async () => {
    registerProviderDefinition({
      id: "openai",
      name: "Custom OpenAI",
      packageName: "custom-openai",
    });

    expect(unregisterProviderDefinition("openai")).toBe(true);

    const definition = await getProviderDefinition("openai");
    expect(definition?.id).toBe("openai");
    expect(definition?.isCustom).not.toBe(true);
    expect(definition?.name).not.toBe("Custom OpenAI");
    expect(definition?.packageName).not.toBe("custom-openai");
  });
});

describe("listProviderModels", () => {
  test("returns catalog models when live is disabled", async () => {
    const result = await listProviderModels("openai", undefined, {
      live: false,
    });
    expect(result.source).toBe("catalog");
    expect(result.models.length).toBeGreaterThan(0);
  });

  test("returns catalog models when no listModels callback is defined", async () => {
    const result = await listProviderModels("anthropic", undefined);
    expect(result.source).toBe("catalog");
    expect(result.models.length).toBeGreaterThan(0);
  });

  test("merges catalog with live response when listModels succeeds", async () => {
    registerProviderDefinition({
      id: "openai",
      name: "OpenAI",
      listModels: async () => [
        { id: "gpt-4o", capabilities: { tools: true } },
        { id: "brand-new-model" },
      ],
    });

    const result = await listProviderModels("openai", undefined);
    expect(result.source).toBe("merged");
    expect(result.fetchedAt).toBeDefined();
    const ids = result.models.map((model) => model.id);
    expect(ids).toContain("gpt-4o");
    expect(ids).toContain("brand-new-model");

    const gpt4o = result.models.find((model) => model.id === "gpt-4o");
    expect(gpt4o?.capabilities?.tools).toBe(true);
    expect(gpt4o?.cost).toBeDefined();
  });

  test("falls back to catalog when listModels throws", async () => {
    registerProviderDefinition({
      id: "openai",
      name: "OpenAI",
      listModels: async () => {
        throw new Error("network boom");
      },
    });

    const result = await listProviderModels("openai", undefined);
    expect(result.source).toBe("catalog");
    expect(result.error).toBe("network boom");
    expect(result.models.length).toBeGreaterThan(0);
  });

  test("returns source 'error' when live fails and catalog is empty", async () => {
    registerProviderDefinition({
      id: "phantom",
      name: "Phantom",
      listModels: async () => {
        throw new Error("nope");
      },
    });

    const result = await listProviderModels("phantom", undefined);
    expect(result.source).toBe("error");
    expect(result.models).toEqual([]);
    expect(result.error).toBe("nope");
  });
});

describe("listAllProviderModels", () => {
  test("returns a result entry for every registered provider", async () => {
    mkdirSync(TEST_DIR, { recursive: true });
    const backend = createJsonFileBackend({ filePath: TEST_FILE });
    const store = createCredentialStore({ backend, env: {} });

    const all = await listAllProviderModels(store, { live: false });
    expect(all.length).toBeGreaterThan(50);
    for (const entry of all) {
      expect(entry.definition.id).toBeDefined();
      expect(entry.result.source).toBe("catalog");
    }
  });
});

describe("mergeCatalogWithLive", () => {
  test("keeps only live-listed ids and overlays capabilities", () => {
    const catalog: ModelInfo[] = [
      {
        id: "a",
        name: "A",
        cost: { input: 1 },
        capabilities: { tools: false },
      },
      { id: "stale", name: "Stale" },
    ];
    const live: ModelInfo[] = [
      { id: "a", capabilities: { tools: true } },
      { id: "brand-new" },
    ];
    const merged = mergeCatalogWithLive(catalog, live);
    const ids = merged.map((model) => model.id);
    expect(ids).toEqual(["a", "brand-new"]);
    const a = merged.find((model) => model.id === "a");
    expect(a?.capabilities?.tools).toBe(true);
    expect(a?.cost?.input).toBe(1);
    expect(a?.name).toBe("A");
  });
});

describe("mergeModelInfo", () => {
  test("overlay wins where defined; base fills in gaps", () => {
    const base: ModelInfo = {
      id: "x",
      name: "Base",
      cost: { input: 1 },
      capabilities: { tools: false, vision: true },
    };
    const overlay: ModelInfo = {
      id: "x",
      contextWindow: 1000,
      capabilities: { tools: true },
    };
    const merged = mergeModelInfo(base, overlay);
    expect(merged.name).toBe("Base");
    expect(merged.contextWindow).toBe(1000);
    expect(merged.capabilities?.tools).toBe(true);
    expect(merged.capabilities?.vision).toBe(true);
    expect(merged.cost?.input).toBe(1);
  });
});
