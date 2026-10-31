import { afterEach, describe, expect, spyOn, test } from "bun:test";
import {
  getProviderDefinition,
  listProviderModels,
  resetProviderRegistry,
} from "../providers";
import { listVeniceModels } from "./venice";

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
  resetProviderRegistry();
});

describe("listVeniceModels", () => {
  test("should preserve unsupported and unknown privacy capabilities", async () => {
    spyOn(globalThis, "fetch").mockResolvedValue(
      Response.json({
        data: [
          {
            id: "unsupported",
            model_spec: {
              capabilities: {
                supportsTeeAttestation: false,
                supportsE2EE: false,
              },
            },
          },
          {
            id: "unknown",
            model_spec: { capabilities: { supportsFunctionCalling: true } },
          },
        ],
      }),
    );
    expect(
      await listVeniceModels({ credential: { type: "api", key: "test-key" } }),
    ).toEqual([
      {
        id: "unsupported",
        sources: ["provider"],
        metadata: { capabilities: { teeAttestation: false, e2ee: false } },
      },
      {
        id: "unknown",
        sources: ["provider"],
        metadata: { capabilities: { tools: true } },
      },
    ]);
  });
  test("should authenticate and map metadata while excluding offline and non-text models", async () => {
    const fetchMock = spyOn(globalThis, "fetch").mockResolvedValue(
      Response.json({
        data: [
          {
            id: "llama-3.2-3b",
            type: "text",
            model_spec: {
              name: "Llama 3.2 3B",
              availableContextTokens: 131072,
              offline: false,
              capabilities: {
                supportsFunctionCalling: true,
                supportsReasoning: false,
                supportsVision: false,
                supportsResponseSchema: true,
                supportsTeeAttestation: true,
                supportsE2EE: true,
              },
              pricing: { input: { usd: 0, diem: 9 }, output: { usd: 0.6 } },
            },
          },
          { id: "offline", type: "text", model_spec: { offline: true } },
          { id: "image-model", type: "image" },
          { id: "audio-model", type: "tts" },
          { id: "minimal" },
        ],
      }),
    );

    const models = await listVeniceModels({
      credential: { type: "api", key: "test-key" },
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.venice.ai/api/v1/models",
      {
        headers: { Authorization: "Bearer test-key" },
        signal: expect.any(AbortSignal),
      },
    );
    expect(models).toEqual([
      {
        id: "llama-3.2-3b",
        sources: ["provider"],
        metadata: {
          name: "Llama 3.2 3B",
          contextWindow: 131072,
          capabilities: {
            tools: true,
            reasoning: false,
            vision: false,
            structuredOutput: true,
            teeAttestation: true,
            e2ee: true,
          },
          cost: { input: 0, output: 0.6 },
        },
      },
      { id: "minimal", sources: ["provider"], metadata: {} },
    ]);
  });

  test("should honor a base URL override and caller abort signal", async () => {
    const fetchMock = spyOn(globalThis, "fetch").mockResolvedValue(
      Response.json({ data: [] }),
    );
    const signal = new AbortController().signal;

    expect(
      await listVeniceModels({
        credential: { type: "api", key: "test-key" },
        baseURL: "https://venice.example/api/v1/",
        signal,
      }),
    ).toEqual([]);
    expect(fetchMock).toHaveBeenCalledWith(
      "https://venice.example/api/v1/models",
      {
        headers: { Authorization: "Bearer test-key" },
        signal,
      },
    );
  });

  test("should reject missing, empty, or incompatible credentials before fetching", async () => {
    const fetchMock = spyOn(globalThis, "fetch");
    for (const credential of [
      undefined,
      { type: "api", key: "" },
      { type: "oauth", accessToken: "token" },
    ] as const) {
      await expect(listVeniceModels({ credential })).rejects.toThrow(
        "API credential",
      );
    }
    expect(fetchMock).not.toHaveBeenCalled();
  });

  test("should report HTTP errors and let the registry fall back to the catalog", async () => {
    spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(null, { status: 401, statusText: "Unauthorized" }),
    );
    const credential = { type: "api", key: "invalid" } as const;

    await expect(listVeniceModels({ credential })).rejects.toThrow(
      "Venice 401 Unauthorized",
    );
    const result = await listProviderModels("venice", credential);
    expect(result.discovery?.status).toBe("error");
    expect(result.models.length).toBeGreaterThan(0);
  });

  test("should register Venice discovery and return live models through the registry", async () => {
    spyOn(globalThis, "fetch").mockResolvedValue(
      Response.json({ data: [{ id: "venice-live-test", type: "text" }] }),
    );

    const definition = await getProviderDefinition("venice");
    expect(definition?.listModels).toBe(listVeniceModels);
    expect(definition?.packageName).toBe("venice-ai-sdk-provider");
    const result = await listProviderModels("venice", {
      type: "api",
      key: "test-key",
    });
    expect(result.discovery?.status).toBe("live");
    expect(result.models).toContainEqual({
      id: "venice-live-test",
      sources: ["provider"],
      metadata: {},
    });
  });
});
