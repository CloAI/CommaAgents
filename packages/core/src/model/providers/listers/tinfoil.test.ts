import { afterEach, describe, expect, it, vi } from "vitest";
import { listTinfoilModels } from "./tinfoil";
import { getProviderDefinition } from "../providers";
import { createCredentialStore } from "../../../credentials";
import { createJsonFileCredentialBackend } from "../../../credentials/backends/json-file";

const originalFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe("Tinfoil discovery", () => {
  it("should list chat models with pricing, context, tools, and mandatory privacy", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      Response.json({
        data: [
          {
            id: "chat",
            name: "Chat model",
            endpoints: ["/v1/chat/completions"],
            context_window: 12345,
            tool_calling: true,
            reasoning: false,
            multimodal: true,
            pricing: {
              inputTokenPricePer1M: 1,
              outputTokenPricePer1M: 2,
              cachedInputTokenPricePer1M: 0,
            },
          },
          {
            id: "embeddings",
            type: "embedding",
            endpoints: ["/v1/embeddings"],
          },
          {
            id: "audio",
            type: "audio",
            endpoints: ["/v1/audio/transcriptions"],
          },
        ],
      }),
    );
    expect(await listTinfoilModels({})).toEqual([
      {
        id: "chat",
        sources: ["provider"],
        metadata: {
          name: "Chat model",
          contextWindow: 12345,
          capabilities: {
            teeAttestation: true,
            e2ee: true,
            tools: true,
            reasoning: false,
            vision: true,
          },
          cost: { input: 1, output: 2, cacheRead: 0 },
        },
      },
    ]);
    expect(fetchSpy.mock.calls[0]?.[0]).toBe(
      "https://inference.tinfoil.sh/v1/models",
    );
    expect(fetchSpy.mock.calls[0]?.[1]?.headers).toBeUndefined();
  });
  it("should register the built-in lister", async () => {
    expect((await getProviderDefinition("tinfoil"))?.listModels).toBe(
      listTinfoilModels,
    );
  });
  it("should resolve TINFOIL_API_KEY without custom mappings", async () => {
    const store = createCredentialStore({
      backend: createJsonFileCredentialBackend({
        filePath: "/tmp/comma-tinfoil-unused-credentials.json",
      }),
      env: { TINFOIL_API_KEY: "test-key" },
    });
    expect(await store.resolve("tinfoil")).toEqual({
      type: "api",
      key: "test-key",
    });
  });
  it("should reject endpoint overrides", async () => {
    await expect(
      listTinfoilModels({ baseURL: "https://untrusted.test" }),
    ).rejects.toThrow("endpoint overrides");
  });
});
