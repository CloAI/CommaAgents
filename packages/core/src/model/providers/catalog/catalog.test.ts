import { describe, expect, test } from "bun:test";
import {
  getCatalogModels,
  getCatalogProvider,
  listCatalogProviders,
  loadCatalog,
} from "./catalog";
import type { CatalogModel } from "./catalog.types";
import { resolveCatalogCachePath, toModelInfo } from "./catalog.utils";

describe("loadCatalog (bundled snapshot)", () => {
  test("returns an object keyed by provider id", async () => {
    const data = await loadCatalog();
    expect(typeof data).toBe("object");
    expect(Object.keys(data).length).toBeGreaterThan(50);
    expect(data.openai?.id).toBe("openai");
    expect(data.anthropic?.id).toBe("anthropic");
  });

  test("providers expose id, name, npm, env, and models", async () => {
    const provider = await getCatalogProvider("openai");
    expect(provider).toBeDefined();
    expect(provider?.name).toBe("OpenAI");
    expect(provider?.npm).toBe("@ai-sdk/openai");
    expect(provider?.env).toContain("OPENAI_API_KEY");
    expect(Object.keys(provider?.models ?? {}).length).toBeGreaterThan(0);
  });

  test("includes github-copilot and amazon-bedrock with verbatim models.dev ids", async () => {
    const copilot = await getCatalogProvider("github-copilot");
    const bedrock = await getCatalogProvider("amazon-bedrock");
    expect(copilot).toBeDefined();
    expect(bedrock).toBeDefined();
  });

  test("listCatalogProviders returns every entry", async () => {
    const providers = await listCatalogProviders();
    expect(providers.length).toBeGreaterThan(50);
    const ids = providers.map((provider) => provider.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe("getCatalogModels", () => {
  test("returns normalized ModelInfo entries for a known provider", async () => {
    const models = await getCatalogModels("anthropic");
    expect(models.length).toBeGreaterThan(0);
    for (const model of models) {
      expect(typeof model.id).toBe("string");
      expect(model.capabilities).toBeDefined();
    }
  });

  test("returns an empty array for unknown providers", async () => {
    const models = await getCatalogModels("does-not-exist");
    expect(models).toEqual([]);
  });
});

describe("toModelInfo", () => {
  test("maps catalog fields into normalized ModelInfo", () => {
    const catalogModel: CatalogModel = {
      id: "gpt-test",
      name: "GPT Test",
      family: "gpt",
      attachment: true,
      reasoning: false,
      tool_call: true,
      structured_output: true,
      open_weights: false,
      knowledge: "2024-06",
      release_date: "2025-01-01",
      last_updated: "2025-01-01",
      modalities: { input: ["text", "image"], output: ["text"] },
      limit: { context: 128000, output: 4096 },
      cost: { input: 2.5, output: 10, cache_read: 0.25 },
    };

    const info = toModelInfo(catalogModel);

    expect(info.id).toBe("gpt-test");
    expect(info.name).toBe("GPT Test");
    expect(info.family).toBe("gpt");
    expect(info.contextWindow).toBe(128000);
    expect(info.maxOutputTokens).toBe(4096);
    expect(info.capabilities?.tools).toBe(true);
    expect(info.capabilities?.vision).toBe(true);
    expect(info.capabilities?.attachment).toBe(true);
    expect(info.capabilities?.structuredOutput).toBe(true);
    expect(info.cost?.input).toBe(2.5);
    expect(info.cost?.cacheRead).toBe(0.25);
    expect(info.modalities?.input).toEqual(["text", "image"]);
  });

  test("drops unknown modalities and statuses", () => {
    const catalogModel: CatalogModel = {
      id: "weird",
      name: "Weird",
      attachment: false,
      reasoning: false,
      tool_call: false,
      open_weights: false,
      release_date: "2025-01-01",
      last_updated: "2025-01-01",
      status: "preview",
      modalities: {
        input: ["text", "hologram" as unknown as string],
        output: ["text"],
      },
      limit: { context: 1000, output: 100 },
    };

    const info = toModelInfo(catalogModel);

    expect(info.status).toBeUndefined();
    expect(info.modalities?.input).toEqual(["text"]);
  });
});

describe("resolveCatalogCachePath", () => {
  test("honors XDG_CACHE_HOME on Linux", () => {
    const path = resolveCatalogCachePath(
      { XDG_CACHE_HOME: "/tmp/xdg" },
      "linux",
    );
    expect(path).toBe("/tmp/xdg/comma-agents/models-catalog.json");
  });

  test("falls back to ~/.cache on Linux when XDG_CACHE_HOME is unset", () => {
    const path = resolveCatalogCachePath({}, "linux");
    expect(path.endsWith("/.cache/comma-agents/models-catalog.json")).toBe(
      true,
    );
  });

  test("uses ~/Library/Caches on macOS", () => {
    const path = resolveCatalogCachePath({}, "darwin");
    expect(
      path.endsWith("/Library/Caches/comma-agents/models-catalog.json"),
    ).toBe(true);
  });

  test("honors LOCALAPPDATA on Windows", () => {
    const path = resolveCatalogCachePath(
      { LOCALAPPDATA: "C:\\Users\\a\\AppData\\Local" },
      "win32",
    );
    expect(path).toContain("comma-agents");
    expect(path).toContain("Cache");
    expect(path.endsWith("models-catalog.json")).toBe(true);
  });
});
