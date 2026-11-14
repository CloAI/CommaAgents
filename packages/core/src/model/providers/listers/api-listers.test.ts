import { afterEach, describe, expect, vi, test } from "vitest";
import { getProviderDefinition, resetProviderRegistry } from "../providers";
import { refreshAndListProviderModels } from "../test.utils";
import { listAnthropicModels } from "./anthropic";
import { listGoogleModels } from "./google";
import { listOpenAIModels } from "./openai";

const originalFetch = globalThis.fetch;
const credential = { type: "api", key: "test-key" } as const;

afterEach(() => {
  globalThis.fetch = originalFetch;
  resetProviderRegistry();
});

describe("API model discovery", () => {
  test("should preserve OpenAI subscription discovery for OAuth credentials", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      Response.json({
        models: [
          {
            slug: "subscription-model",
            display_name: "Subscription Model",
            visibility: "list",
          },
          {
            slug: "hidden-model",
            display_name: "Hidden",
            visibility: "hidden",
          },
        ],
      }),
    );
    const models = await refreshAndListProviderModels("openai", {
      type: "oauth",
      accessToken: "subscription-token",
      expiresAt: new Date(Date.now() + 3600000).toISOString(),
      metadata: {
        clientId: "test-client",
        subject: "test-user",
        scopes: ["chatgpt.tokens.use.direct"],
        idToken: "test-id-token",
      },
    });
    expect(
      models.filter((model) => model.sources.includes("provider")),
    ).toEqual([
      {
        id: "subscription-model",
        sources: ["provider"],
        metadata: { name: "Subscription Model" },
      },
    ]);
    expect(fetchMock.mock.calls[0]?.[1]?.headers).toEqual({
      Authorization: "Bearer subscription-token",
    });
  });
  for (const provider of [
    {
      id: "openai",
      listModels: listOpenAIModels,
      url: "https://api.openai.com/v1/models",
      headers: { Authorization: "Bearer test-key" },
      payload: { data: [{ id: "live-test" }] },
    },
    {
      id: "anthropic",
      listModels: listAnthropicModels,
      url: "https://api.anthropic.com/v1/models?limit=1000",
      headers: { "x-api-key": "test-key", "anthropic-version": "2023-06-01" },
      payload: { data: [{ id: "live-test" }], has_more: false },
    },
    {
      id: "google",
      listModels: listGoogleModels,
      url: "https://generativelanguage.googleapis.com/v1beta/models?pageSize=1000",
      headers: { "x-goog-api-key": "test-key" },
      payload: {
        models: [
          {
            name: "models/live-test",
            supportedGenerationMethods: ["generateContent"],
          },
        ],
      },
    },
  ]) {
    test(`should discover ${provider.id} models through its registered lister`, async () => {
      const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
        Response.json(provider.payload),
      );
      expect((await getProviderDefinition(provider.id))?.listModels).toBe(
        provider.listModels,
      );
      const models = await refreshAndListProviderModels(
        provider.id,
        credential,
      );
      expect(models).toContainEqual({
        id: "live-test",
        sources: ["provider"],
        metadata: {},
      });
      expect(fetchMock).toHaveBeenCalledWith(provider.url, {
        headers: provider.headers,
        signal: expect.any(AbortSignal),
      });
    });

    test(`should reject invalid ${provider.id} credentials before fetching`, async () => {
      const fetchMock = vi.spyOn(globalThis, "fetch");
      for (const invalidCredential of [
        undefined,
        { type: "api", key: "" },
        { type: "oauth", accessToken: "token" },
      ] as const) {
        await expect(
          provider.listModels({ credential: invalidCredential }),
        ).rejects.toThrow("API credential");
      }
      expect(fetchMock).not.toHaveBeenCalled();
    });

    test(`should honor ${provider.id} base URL and cancellation overrides`, async () => {
      const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
        Response.json(provider.payload),
      );
      const signal = new AbortController().signal;
      await provider.listModels({
        credential,
        baseURL: "https://example.test/api/",
        signal,
      });
      const requestUrl = new URL(String(fetchMock.mock.calls[0]?.[0]));
      expect(requestUrl.origin + requestUrl.pathname).toBe(
        "https://example.test/api/models",
      );
      expect(fetchMock.mock.calls[0]?.[1]?.signal).toBe(signal);
    });

    test(`should report ${provider.id} HTTP errors and fall back to catalog models`, async () => {
      vi.spyOn(globalThis, "fetch").mockResolvedValue(
        new Response(null, { status: 401, statusText: "Unauthorized" }),
      );
      await expect(provider.listModels({ credential })).rejects.toThrow(
        "401 Unauthorized",
      );
      const models = await refreshAndListProviderModels(
        provider.id,
        credential,
      );
      expect(models.length).toBeGreaterThan(0);
    });
  }

  test("should follow Anthropic cursors and preserve names and token limits", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(
        Response.json({
          data: [
            {
              id: "claude-first",
              display_name: "Claude First",
              max_input_tokens: 200000,
              max_tokens: 32000,
            },
          ],
          has_more: true,
          last_id: "claude-first",
        }),
      )
      .mockResolvedValueOnce(
        Response.json({
          data: [{ id: "claude-second", max_input_tokens: null }],
          has_more: false,
        }),
      );
    expect(await listAnthropicModels({ credential })).toEqual([
      {
        id: "claude-first",
        sources: ["provider"],
        metadata: {
          name: "Claude First",
          maxInputTokens: 200000,
          maxOutputTokens: 32000,
        },
      },
      { id: "claude-second", sources: ["provider"], metadata: {} },
    ]);
    expect(fetchMock.mock.calls[1]?.[0]).toBe(
      "https://api.anthropic.com/v1/models?limit=1000&after_id=claude-first",
    );
    expect(fetchMock.mock.calls[1]?.[1]?.signal).toBe(
      fetchMock.mock.calls[0]?.[1]?.signal,
    );
  });

  test("should follow Google pages, filter embeddings, and normalize metadata", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(
        Response.json({
          models: [
            {
              name: "models/gemini-first",
              displayName: "Gemini First",
              inputTokenLimit: 1000000,
              outputTokenLimit: 8192,
              thinking: false,
              supportedGenerationMethods: ["generateContent"],
            },
            {
              name: "models/embedding",
              supportedGenerationMethods: ["embedContent"],
            },
          ],
          nextPageToken: "next/token",
        }),
      )
      .mockResolvedValueOnce(
        Response.json({
          models: [
            {
              name: "models/gemini-second",
              supportedGenerationMethods: ["generateContent"],
            },
          ],
        }),
      );
    expect(await listGoogleModels({ credential })).toEqual([
      {
        id: "gemini-first",
        sources: ["provider"],
        metadata: {
          name: "Gemini First",
          maxInputTokens: 1000000,
          maxOutputTokens: 8192,
          capabilities: { reasoning: false },
        },
      },
      { id: "gemini-second", sources: ["provider"], metadata: {} },
    ]);
    expect(fetchMock.mock.calls[1]?.[0]).toBe(
      "https://generativelanguage.googleapis.com/v1beta/models?pageSize=1000&pageToken=next%2Ftoken",
    );
    expect(fetchMock.mock.calls[1]?.[1]?.signal).toBe(
      fetchMock.mock.calls[0]?.[1]?.signal,
    );
  });

  test("should accept an empty Google ProtoJSON response", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(Response.json({}));
    expect(await listGoogleModels({ credential })).toEqual([]);
  });

  test("should reject incomplete or cyclic pagination instead of returning partial lists", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      Response.json({ data: [], has_more: true }),
    );
    await expect(listAnthropicModels({ credential })).rejects.toThrow(
      "pagination cursor",
    );
    const fetchMock = vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(Response.json({ nextPageToken: "repeat" }))
      .mockResolvedValueOnce(Response.json({ nextPageToken: "repeat" }));
    await expect(listGoogleModels({ credential })).rejects.toThrow(
      "pagination token",
    );
    expect(fetchMock.mock.calls.length).toBeLessThanOrEqual(3);
  });
});
