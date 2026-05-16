import { describe, expect, test } from "bun:test";
import { listOllamaModels } from "./ollama";

interface MockResponse {
  readonly ok: boolean;
  readonly status: number;
  readonly statusText: string;
  readonly json: () => Promise<unknown>;
}

function withMockedFetch(
  mock: (url: string) => MockResponse | Promise<MockResponse>,
): () => void {
  const original = globalThis.fetch;
  globalThis.fetch = (async (input: unknown): Promise<Response> => {
    const url = typeof input === "string" ? input : String(input);
    return (await mock(url)) as unknown as Response;
  }) as typeof globalThis.fetch;
  return () => {
    globalThis.fetch = original;
  };
}

describe("listOllamaModels", () => {
  test("hits {baseURL}/api/tags and maps model entries", async () => {
    let seenUrl = "";
    const restore = withMockedFetch((url) => {
      seenUrl = url;
      return {
        ok: true,
        status: 200,
        statusText: "OK",
        json: async () => ({
          models: [
            {
              name: "llama3.3:latest",
              model: "llama3.3:latest",
              modified_at: "2025-02-10T12:00:00Z",
              details: { family: "llama" },
            },
            { name: "qwen2.5-coder:7b" },
          ],
        }),
      };
    });

    try {
      const models = await listOllamaModels({
        baseURL: "http://localhost:11434",
      });
      expect(seenUrl).toBe("http://localhost:11434/api/tags");
      expect(models).toHaveLength(2);
      expect(models[0]?.id).toBe("llama3.3:latest");
      expect(models[0]?.family).toBe("llama");
      expect(models[0]?.lastUpdated).toBe("2025-02-10");
      expect(models[1]?.id).toBe("qwen2.5-coder:7b");
    } finally {
      restore();
    }
  });

  test("throws when the response is not ok", async () => {
    const restore = withMockedFetch(() => ({
      ok: false,
      status: 503,
      statusText: "Service Unavailable",
      json: async () => ({}),
    }));

    try {
      await expect(
        listOllamaModels({ baseURL: "http://localhost:11434" }),
      ).rejects.toThrow(/503/);
    } finally {
      restore();
    }
  });

  test("uses default base URL when none is provided", async () => {
    let seenUrl = "";
    const restore = withMockedFetch((url) => {
      seenUrl = url;
      return {
        ok: true,
        status: 200,
        statusText: "OK",
        json: async () => ({ models: [] }),
      };
    });

    try {
      await listOllamaModels({});
      expect(seenUrl).toBe("http://localhost:11434/api/tags");
    } finally {
      restore();
    }
  });
});
