import { afterEach, describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { createJsonFileCredentialBackend } from "../../credentials/backends/json-file";
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
    expect(def?.origin).toBe("registered");
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
    expect(definition?.origin).toBe("builtin");
    expect(definition?.name).not.toBe("Custom OpenAI");
    expect(definition?.packageName).not.toBe("custom-openai");
  });
});

describe("listProviderModels", () => {
  test("returns catalog models when live is disabled", async () => {
    const result = await listProviderModels("openai", undefined, {
      live: false,
    });
    expect(
      result.models.every((model) => model.sources.includes("models.dev")),
    ).toBe(true);
    expect(result.models.length).toBeGreaterThan(0);
  });

  test("returns catalog models when no listModels callback is defined", async () => {
    const result = await listProviderModels("deepseek", undefined);
    expect(
      result.models.every((model) => model.sources.includes("models.dev")),
    ).toBe(true);
    expect(result.models.length).toBeGreaterThan(0);
  });

  test("merges catalog with live response when listModels succeeds", async () => {
    registerProviderDefinition({
      id: "openai",
      name: "OpenAI",
      listModels: async () => [
        {
          id: "gpt-4o",
          sources: ["provider"],
          metadata: { capabilities: { tools: true } },
        },
        { id: "brand-new-model", sources: ["provider"], metadata: {} },
      ],
    });

    const result = await listProviderModels("openai", undefined);
    expect(result.discovery.status).toBe("live");
    expect(result.discovery.fetchedAt).toBeDefined();
    const ids = result.models.map((model) => model.id);
    expect(ids).toContain("gpt-4o");
    expect(ids).toContain("brand-new-model");

    const gpt4o = result.models.find((model) => model.id === "gpt-4o");
    expect(gpt4o?.metadata.capabilities?.tools).toBe(true);
    expect(gpt4o?.metadata.cost).toBeDefined();
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
    expect(
      result.models.every((model) => model.sources.includes("models.dev")),
    ).toBe(true);
    expect(result.discovery.error).toBe("Live model discovery failed.");
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
    expect(result.discovery.status).toBe("error");
    expect(result.models).toEqual([]);
    expect(result.discovery.error).toBe("Live model discovery failed.");
  });
});

describe("listAllProviderModels", () => {
  test("returns a result entry for every registered provider", async () => {
    mkdirSync(TEST_DIR, { recursive: true });
    const backend = createJsonFileCredentialBackend({ filePath: TEST_FILE });
    const store = createCredentialStore({ backend, env: {} });

    const all = await listAllProviderModels(store, { live: false });
    expect(all.length).toBeGreaterThan(50);
    for (const entry of all) {
      expect(entry.definition.id).toBeDefined();
      expect(entry.result.discovery.status).toBe("catalog_only");
    }
  });
});

describe("mergeCatalogWithLive", () => {
  test("keeps the union of ids and overlays capabilities", () => {
    const catalog: ModelInfo[] = [
      {
        id: "a",
        sources: ["models.dev"],
        metadata: {
          name: "A",
          cost: { input: 1 },
          capabilities: { tools: false },
        },
      },
      { id: "stale", sources: ["models.dev"], metadata: { name: "Stale" } },
    ];
    const live: ModelInfo[] = [
      {
        id: "a",
        sources: ["provider"],
        metadata: { capabilities: { tools: true } },
      },
      { id: "brand-new", sources: ["provider"], metadata: {} },
    ];
    const merged = mergeCatalogWithLive(catalog, live);
    const ids = merged.map((model) => model.id);
    expect(ids).toEqual(["a", "brand-new", "stale"]);
    const a = merged.find((model) => model.id === "a");
    expect(a?.metadata.capabilities?.tools).toBe(true);
    expect(a?.metadata.cost?.input).toBe(1);
    expect(a?.metadata.name).toBe("A");
  });
});

describe("mergeModelInfo", () => {
  test("overlay wins where defined; base fills in gaps", () => {
    const base: ModelInfo = {
      id: "x",
      sources: ["models.dev"],
      metadata: {
        name: "Base",
        cost: { input: 1 },
        capabilities: { tools: false, vision: true },
      },
    };
    const overlay: ModelInfo = {
      id: "x",
      sources: ["provider"],
      metadata: { contextWindow: 1000, capabilities: { tools: true } },
    };
    const merged = mergeModelInfo(base, overlay);
    expect(merged.metadata.name).toBe("Base");
    expect(merged.metadata.contextWindow).toBe(1000);
    expect(merged.metadata.capabilities?.tools).toBe(true);
    expect(merged.metadata.capabilities?.vision).toBe(true);
    expect(merged.metadata.cost?.input).toBe(1);
  });
});

describe("resolved catalog schema", () => {
  test("should preserve every capability and resolve nested fields across three sources", async () => {
    const { ModelInfoSchema } = await import("./providers.schemas");
    const manual: ModelInfo = {
      id: "private-model",
      sources: ["user"],
      metadata: {
        capabilities: {
          tools: true,
          reasoning: true,
          vision: true,
          attachment: true,
          structuredOutput: true,
          teeAttestation: true,
          e2ee: true,
        },
        modalities: { input: ["image"], output: ["text"] },
        cost: { input: 9, output: 9, cacheWrite: 0.5 },
      },
    };
    const catalog: ModelInfo = {
      id: "private-model",
      sources: ["models.dev"],
      metadata: {
        name: "Catalog name",
        capabilities: { tools: false, reasoning: false },
        modalities: { input: ["text"] },
        cost: { input: 2, output: 3 },
      },
    };
    const live: ModelInfo = {
      id: "private-model",
      sources: ["provider"],
      metadata: {
        name: "Live name",
        contextWindow: 0,
        capabilities: { tools: true, e2ee: false },
        modalities: { input: [] },
        cost: { input: 0 },
      },
    };
    const result = ModelInfoSchema.parse(
      mergeModelInfo(manual, mergeModelInfo(catalog, live)),
    );
    expect(result).toEqual({
      id: "private-model",
      sources: ["provider", "models.dev", "user"],
      metadata: {
        name: "Live name",
        contextWindow: 0,
        capabilities: {
          tools: true,
          reasoning: false,
          vision: true,
          attachment: true,
          structuredOutput: true,
          teeAttestation: true,
          e2ee: false,
        },
        modalities: { input: [], output: ["text"] },
        cost: { input: 0, output: 3, cacheWrite: 0.5 },
      },
    });
    expect(
      ModelInfoSchema.safeParse({ id: "old", capabilities: { e2ee: true } })
        .success,
    ).toBe(false);
    expect(
      ModelInfoSchema.safeParse({
        ...result,
        metadata: { capabilities: { ee2: true } },
      }).success,
    ).toBe(false);
  });
});
