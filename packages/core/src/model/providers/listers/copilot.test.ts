import { describe, expect, test } from "bun:test";
import { listCopilotModels } from "./copilot";

interface MockResponse {
  readonly ok: boolean;
  readonly status: number;
  readonly statusText: string;
  readonly json: () => Promise<unknown>;
}

interface MockCall {
  url: string;
  headers: Record<string, string>;
}

function withMockedFetch(
  mock: (call: MockCall) => MockResponse | Promise<MockResponse>,
): { restore: () => void; calls: MockCall[] } {
  const calls: MockCall[] = [];
  const original = globalThis.fetch;
  globalThis.fetch = (async (input: unknown, init?: RequestInit): Promise<Response> => {
    const url = typeof input === "string" ? input : String(input);
    const headers = (init?.headers ?? {}) as Record<string, string>;
    const call = { url, headers };
    calls.push(call);
    return (await mock(call)) as unknown as Response;
  }) as typeof globalThis.fetch;
  return {
    calls,
    restore: () => {
      globalThis.fetch = original;
    },
  };
}

const sampleResponse = {
  data: [
    {
      id: "gpt-5",
      name: "GPT-5",
      model_picker_enabled: true,
      policy: { state: "enabled" },
      capabilities: {
        family: "gpt",
        limits: { max_context_window_tokens: 200000, max_output_tokens: 8192 },
        supports: { tool_calls: true, vision: true, streaming: true },
      },
    },
    {
      id: "claude-sonnet-4-hidden",
      name: "Hidden",
      model_picker_enabled: false,
      policy: { state: "enabled" },
      capabilities: {},
    },
    {
      id: "disabled-model",
      name: "Disabled",
      model_picker_enabled: true,
      policy: { state: "disabled" },
      capabilities: {},
    },
  ],
};

describe("listCopilotModels", () => {
  test("calls {base}/models with Bearer auth and maps enabled models", async () => {
    const { restore, calls } = withMockedFetch(() => ({
      ok: true,
      status: 200,
      statusText: "OK",
      json: async () => sampleResponse,
    }));

    try {
      const models = await listCopilotModels({
        credential: { type: "oauth", accessToken: "gho_test" },
      });

      expect(calls).toHaveLength(1);
      expect(calls[0]?.url).toBe("https://api.githubcopilot.com/models");
      expect(calls[0]?.headers.Authorization).toBe("Bearer gho_test");
      expect(calls[0]?.headers["User-Agent"]).toBe("cloai");

      expect(models).toHaveLength(1);
      expect(models[0]?.id).toBe("gpt-5");
      expect(models[0]?.contextWindow).toBe(200000);
      expect(models[0]?.capabilities?.tools).toBe(true);
      expect(models[0]?.capabilities?.vision).toBe(true);
    } finally {
      restore();
    }
  });

  test("uses enterprise base when credential metadata has enterpriseDomain", async () => {
    const { restore, calls } = withMockedFetch(() => ({
      ok: true,
      status: 200,
      statusText: "OK",
      json: async () => ({ data: [] }),
    }));

    try {
      await listCopilotModels({
        credential: {
          type: "oauth",
          accessToken: "gho_test",
          metadata: { enterpriseDomain: "ghe.example.com" },
        },
      });
      expect(calls[0]?.url).toBe("https://copilot-api.ghe.example.com/models");
    } finally {
      restore();
    }
  });

  test("throws when no credential is present", async () => {
    await expect(listCopilotModels({})).rejects.toThrow(/OAuth or API/);
  });

  test("throws on non-ok response", async () => {
    const { restore } = withMockedFetch(() => ({
      ok: false,
      status: 401,
      statusText: "Unauthorized",
      json: async () => ({}),
    }));

    try {
      await expect(
        listCopilotModels({ credential: { type: "oauth", accessToken: "bad" } }),
      ).rejects.toThrow(/401/);
    } finally {
      restore();
    }
  });
});
