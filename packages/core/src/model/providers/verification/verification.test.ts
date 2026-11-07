import type { MockInstance } from "vitest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createCredentialStore } from "../../../credentials/credentials";
import {
  getGlobalCredentialStore,
  setGlobalCredentialStore,
} from "../../../credentials/global-credential-store";
import type { CredentialStoreData } from "../../../credentials/credentials.types";
import {
  getProviderDefinition,
  registerProviderDefinition,
  unregisterProviderDefinition,
} from "../providers";
import { supportsProviderVerification, verifyProvider } from "./verification";

let previousStore: ReturnType<typeof getGlobalCredentialStore>;
let fetchSpy: MockInstance<typeof globalThis.fetch>;

beforeEach(async () => {
  previousStore = getGlobalCredentialStore();
  let data: CredentialStoreData = {};
  setGlobalCredentialStore(
    createCredentialStore({
      backend: {
        async readAll() {
          return data;
        },
        async writeAll(nextData) {
          data = nextData;
        },
      },
      env: {},
    }),
  );
  fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(Response.json({}));
  for (const providerId of ["openai", "anthropic", "google"]) {
    registerProviderDefinition({
      id: providerId,
      name: providerId,
      credentialType: "api",
    });
  }
  // Catalog initialization is unrelated to the authenticated request under test.
  await getProviderDefinition("openai");
  fetchSpy.mockClear();
});

afterEach(() => {
  fetchSpy.mockRestore();
  setGlobalCredentialStore(previousStore);
  for (const providerId of ["openai", "anthropic", "google"]) {
    unregisterProviderDefinition(providerId);
  }
});

describe("verifyProvider", () => {
  it("should reject unknown and noncanonical provider IDs without a request", async () => {
    await expect(
      verifyProvider({ providerId: "verification-unknown" }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(
      verifyProvider({ providerId: " openai " }),
    ).rejects.toMatchObject({ code: "INVALID_ARGUMENTS" });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("should report unsupported providers and missing credentials without a request", async () => {
    expect((await verifyProvider({ providerId: "ollama" })).status).toBe(
      "unsupported",
    );
    expect((await verifyProvider({ providerId: "openai" })).status).toBe(
      "unconfigured",
    );
    expect(supportsProviderVerification("constructor")).toBe(false);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("should verify each provider with one authenticated GET using its own response schema", async () => {
    const cases = [
      {
        providerId: "openai",
        response: { object: "list", data: [{ id: "test-model" }] },
        url: "https://api.openai.com/v1/models",
        header: "Authorization",
        value: "Bearer test-key",
      },
      {
        providerId: "anthropic",
        response: { data: [{ id: "test-model" }], has_more: true },
        url: "https://api.anthropic.com/v1/models?limit=1",
        header: "x-api-key",
        value: "test-key",
      },
      {
        providerId: "google",
        response: { models: [{ name: "models/test-model" }] },
        url: "https://generativelanguage.googleapis.com/v1/models?pageSize=1",
        header: "x-goog-api-key",
        value: "test-key",
      },
    ];
    for (const testCase of cases) {
      await getGlobalCredentialStore().set(testCase.providerId, "$global", {
        type: "api",
        key: "test-key",
      });
      fetchSpy.mockResolvedValue(Response.json(testCase.response));
      const verification = await verifyProvider({
        providerId: testCase.providerId,
      });
      expect(verification).toEqual({
        providerId: testCase.providerId,
        status: "verified",
        checkedAt: expect.any(String),
      });
      expect(Number.isNaN(Date.parse(verification.checkedAt))).toBe(false);
      const call = fetchSpy.mock.calls.at(-1)!;
      expect(call[0]).toBe(testCase.url);
      expect(call[1]).toMatchObject({ method: "GET", redirect: "error" });
      expect(new Headers(call[1]?.headers).get(testCase.header)).toBe(
        testCase.value,
      );
      expect(String(call[0])).not.toContain("test-key");
    }
    expect(fetchSpy).toHaveBeenCalledTimes(3);
  });

  it("should resolve environment credentials before a saved key", async () => {
    let data: CredentialStoreData = {};
    const store = createCredentialStore({
      backend: {
        async readAll() {
          return data;
        },
        async writeAll(nextData) {
          data = nextData;
        },
      },
      env: { OPENAI_API_KEY: "environment-key" },
    });
    setGlobalCredentialStore(store);
    await store.set("openai", "$global", { type: "api", key: "saved-key" });
    fetchSpy.mockResolvedValue(Response.json({ object: "list", data: [] }));
    expect((await verifyProvider({ providerId: "openai" })).status).toBe(
      "verified",
    );
    expect(
      new Headers(fetchSpy.mock.calls[0]?.[1]?.headers).get("Authorization"),
    ).toBe("Bearer environment-key");
    expect(await store.get("openai", "$global")).toEqual({
      type: "api",
      key: "saved-key",
    });
  });

  it("should accept an omitted empty Gemini model list while rejecting malformed payloads", async () => {
    await getGlobalCredentialStore().set("google", "$global", {
      type: "api",
      key: "test-key",
    });
    for (const payload of [{}, { models: [] }]) {
      fetchSpy.mockResolvedValue(Response.json(payload));
      expect((await verifyProvider({ providerId: "google" })).status).toBe(
        "verified",
      );
    }
    for (const payload of [
      { error: "unexpected error body" },
      { models: [{ id: "wrong-shape" }] },
      { models: null },
    ]) {
      fetchSpy.mockResolvedValue(Response.json(payload));
      expect((await verifyProvider({ providerId: "google" })).status).toBe(
        "invalid_response",
      );
    }
  });

  it("should never attempt OAuth or unauthenticated provider checks in this API-key phase", async () => {
    await getGlobalCredentialStore().set("openai", "$global", {
      type: "oauth",
      accessToken: "oauth-token",
    });
    expect((await verifyProvider({ providerId: "openai" })).status).toBe(
      "unsupported",
    );
    registerProviderDefinition({
      id: "openai",
      name: "OpenAI",
      credentialType: "none",
    });
    expect((await verifyProvider({ providerId: "openai" })).status).toBe(
      "unsupported",
    );
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("should make a fresh request only for each explicit invocation and skip pre-aborted calls", async () => {
    await getGlobalCredentialStore().set("openai", "$global", {
      type: "api",
      key: "test-key",
    });
    const owner = new AbortController();
    owner.abort();
    expect(
      (await verifyProvider({ providerId: "openai" }, { signal: owner.signal }))
        .status,
    ).toBe("unavailable");
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockImplementation(
      Object.assign(async () => Response.json({ object: "list", data: [] }), {

      }),
    );
    await verifyProvider({ providerId: "openai" });
    await verifyProvider({ providerId: "openai" });
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });

  it("should map HTTP failures without exposing provider bodies or retrying", async () => {
    await getGlobalCredentialStore().set("openai", "$global", {
      type: "api",
      key: "secret-key",
    });
    for (const [httpStatus, expected] of [
      [401, "invalid_credentials"],
      [403, "access_denied"],
      [429, "rate_limited"],
      [503, "unavailable"],
      [302, "invalid_response"],
    ] as const) {
      fetchSpy.mockResolvedValue(
        new Response("secret-key and private provider error", {
          status: httpStatus,
        }),
      );
      const verification = await verifyProvider({ providerId: "openai" });
      expect(verification.status).toBe(expected);
      expect(JSON.stringify(verification)).not.toContain("secret-key");
    }
    expect(fetchSpy).toHaveBeenCalledTimes(5);
  });

  it("should reject malformed successful responses and sanitize thrown failures", async () => {
    await getGlobalCredentialStore().set("openai", "$global", {
      type: "api",
      key: "secret-key",
    });
    for (const payload of [
      {},
      { object: "list", data: [{ name: "wrong-format" }] },
      { object: "list", data: "wrong-format" },
    ]) {
      fetchSpy.mockResolvedValue(Response.json(payload));
      expect((await verifyProvider({ providerId: "openai" })).status).toBe(
        "invalid_response",
      );
    }
    fetchSpy.mockResolvedValue(new Response("not-json"));
    expect((await verifyProvider({ providerId: "openai" })).status).toBe(
      "invalid_response",
    );
    fetchSpy.mockRejectedValue(new Error("Authorization: Bearer secret-key"));
    expect(await verifyProvider({ providerId: "openai" })).toMatchObject({
      status: "unavailable",
    });
  });

  it("should cancel an in-flight request when its owner is disposed", async () => {
    await getGlobalCredentialStore().set("openai", "$global", {
      type: "api",
      key: "test-key",
    });
    const owner = new AbortController();
    fetchSpy.mockImplementation(
      Object.assign(
        (_input: string | Request | URL, options?: RequestInit) =>
          new Promise<Response>((_resolve, reject) => {
            options?.signal?.addEventListener(
              "abort",
              () => reject(new DOMException("Aborted", "AbortError")),
              { once: true },
            );
            queueMicrotask(() => owner.abort());
          }),
        {  },
      ),
    );
    expect(
      (await verifyProvider({ providerId: "openai" }, { signal: owner.signal }))
        .status,
    ).toBe("unavailable");
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it("should apply the five-second timeout while reading the body too", async () => {
    await getGlobalCredentialStore().set("openai", "$global", {
      type: "api",
      key: "test-key",
    });
    fetchSpy.mockImplementation(
      Object.assign(
        async (_input: string | Request | URL, options?: RequestInit) =>
          new Response(
            new ReadableStream({
              start(controller) {
                options?.signal?.addEventListener(
                  "abort",
                  () =>
                    controller.error(new DOMException("Aborted", "AbortError")),
                  { once: true },
                );
              },
            }),
          ),
        {  },
      ),
    );
    expect((await verifyProvider({ providerId: "openai" })).status).toBe(
      "timeout",
    );
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  }, 7_000);
});
