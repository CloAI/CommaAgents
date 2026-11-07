import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { exportJWK, generateKeyPair, SignJWT } from "jose";
import { generateText } from "ai";
import {
  createCredentialStore,
  getGlobalCredentialStore,
  setGlobalCredentialStore,
} from "../../../credentials";
import type { CredentialStoreData } from "../../../credentials/credentials.types";
import { createProviderAuthentication } from "./authentication";
import {
  createOpenAISubscriptionProvider,
  refreshOpenAICredential,
} from "./openai";
import { OPENAI_AUTH_SCOPE } from "./openai.constants";
import type { OAuthCredential } from "../../../credentials/credentials.schema";

const originalFetch = globalThis.fetch;
const previousStore = getGlobalCredentialStore();
const keys = await generateKeyPair("ES256");
const publicKey = {
  ...(await exportJWK(keys.publicKey)),
  kid: "comma-oauth-test",
  alg: "ES256",
  use: "sig",
};
let authentication: ReturnType<typeof createProviderAuthentication>;
let data: CredentialStoreData;
let tokenRequests: URLSearchParams[];
let nonce: string;
let tokenScope: string;
let invalidSignature: boolean;
let tokenStatus: number;
let requestBodies: Record<string, unknown>[];
let streamEvents: string;

beforeEach(() => {
  data = {};
  tokenRequests = [];
  requestBodies = [];
  nonce = "";
  tokenScope = "openid offline_access chatgpt.tokens.use.direct";
  invalidSignature = false;
  tokenStatus = 200;
  streamEvents = "";
  setGlobalCredentialStore(
    createCredentialStore({
      env: {},
      backend: {
        readAll: async () => structuredClone(data),
        writeAll: async (next) => {
          data = structuredClone(next);
        },
      },
    }),
  );
  authentication = createProviderAuthentication();
  vi.spyOn(globalThis, "fetch").mockImplementation(
    Object.assign(
      async (
        input: Parameters<typeof fetch>[0],
        options?: Parameters<typeof fetch>[1],
      ) => {
        const url = String(input);
        if (url.includes("/.well-known/jwks.json")) {
          return Response.json({ keys: [publicKey] });
        }
        if (url.endsWith("/oauth/token")) {
          const parameters = new URLSearchParams(String(options?.body));
          tokenRequests.push(parameters);
          if (tokenStatus !== 200) {
            return new Response("secret body must not escape", {
              status: tokenStatus,
            });
          }
          const idToken = invalidSignature
            ? "bad.signature.token"
            : await new SignJWT({ nonce, email: "tester@example.com" })
                .setProtectedHeader({ alg: "ES256", kid: "comma-oauth-test" })
                .setSubject("account-test")
                .setAudience("oaiapp_test")
                .setIssuer("https://auth.openai.com")
                .setIssuedAt()
                .setExpirationTime("1h")
                .sign(keys.privateKey);
          return Response.json({
            access_token: "subscription-token",
            refresh_token: "rotated-refresh",
            token_type: "Bearer",
            expires_in: 3600,
            id_token: idToken,
            scope: tokenScope,
          });
        }
        if (url.endsWith("/responses")) {
          expect(new Headers(options?.headers).get("Authorization")).toBe(
            "Bearer subscription-token",
          );
          requestBodies.push(JSON.parse(String(options?.body)));
          return new Response(streamEvents, {
            headers: { "Content-Type": "text/event-stream" },
          });
        }
        return originalFetch(input, options);
      },
      {},
    ),
  );
});
afterEach(() => {
  authentication.dispose();
  setGlobalCredentialStore(previousStore);
  globalThis.fetch = originalFetch;
});

async function begin() {
  const result = await authentication.beginSignIn({ providerId: "openai" });
  const authorization = new URL(result.authorizationURL);
  nonce = authorization.searchParams.get("nonce")!;
  const callback = new URL(authorization.searchParams.get("redirect_uri")!);
  callback.search = new URLSearchParams({
    state: authorization.searchParams.get("state")!,
    code: "test-code",
    client_id: "oaiapp_test",
  }).toString();
  return { result, authorization, callback };
}
async function signIn() {
  const attempt = await begin();
  const response = await originalFetch(attempt.callback);
  expect(response.status).toBe(200);
  return attempt;
}

describe("subscription sign-in", () => {
  it("should validate OAuth, store credentials only in core and reuse the issued registration", async () => {
    const { result, authorization } = await signIn();
    expect(authorization.searchParams.get("client_id")).toBe(
      "dynamic_agent_client",
    );
    expect(authorization.searchParams.get("agent_name_hint")).toBe(
      "Comma Agents",
    );
    expect(authorization.searchParams.get("code_challenge_method")).toBe(
      "S256",
    );
    expect(data[OPENAI_AUTH_SCOPE]?.openai).toMatchObject({
      type: "custom",
      data: { clientId: "oaiapp_test", subject: "account-test" },
    });
    expect(data.$global?.openai).toMatchObject({
      type: "oauth",
      accessToken: "subscription-token",
      refreshToken: "rotated-refresh",
    });
    expect(
      authentication.getSignInStatus({ attemptId: result.attemptId }),
    ).toEqual({ attemptId: result.attemptId, status: "connected" });
    expect(
      JSON.stringify(
        authentication.getSignInStatus({ attemptId: result.attemptId }),
      ),
    ).not.toContain("subscription-token");
    expect(tokenRequests[0]?.get("client_id")).toBe("oaiapp_test");
    expect(tokenRequests[0]?.get("redirect_uri")).toBe(
      authorization.searchParams.get("redirect_uri"),
    );
    const second = await begin();
    expect(second.authorization.searchParams.get("client_id")).toBe(
      "oaiapp_test",
    );
    expect(second.authorization.searchParams.get("agent_name_hint")).toBeNull();
    expect(second.authorization.searchParams.get("ext_agent_host_id")).toBe(
      authorization.searchParams.get("ext_agent_host_id"),
    );
    expect(second.authorization.searchParams.has("id_token_hint")).toBe(false);
  });
  it("should ignore an invalid state and accept the subsequent genuine callback", async () => {
    const { result, callback } = await begin();
    const forged = new URL(callback);
    forged.searchParams.set("state", "forged");
    expect((await originalFetch(forged)).status).toBe(400);
    expect(tokenRequests).toHaveLength(0);
    expect(
      authentication.getSignInStatus({ attemptId: result.attemptId }).status,
    ).toBe("pending");
    expect((await originalFetch(callback)).status).toBe(200);
  });
  it("should preserve existing credentials when consent is declined", async () => {
    await getGlobalCredentialStore().set("openai", "$global", {
      type: "api",
      key: "existing-key",
    });
    const { result, callback } = await begin();
    callback.searchParams.set("error", "access_denied");
    expect((await originalFetch(callback)).status).toBe(400);
    expect(tokenRequests).toHaveLength(0);
    expect(data.$global?.openai).toEqual({ type: "api", key: "existing-key" });
    expect(
      authentication.getSignInStatus({ attemptId: result.attemptId }).status,
    ).toBe("error");
  });
  for (const failure of ["signature", "scope", "nonce", "exchange"] as const) {
    it(`should reject invalid ${failure} without activating a credential`, async () => {
      const { result, callback } = await begin();
      if (failure === "signature") {
        invalidSignature = true;
      }
      if (failure === "scope") {
        tokenScope = "openid email";
      }
      if (failure === "nonce") {
        nonce = "another-attempt";
      }
      if (failure === "exchange") {
        tokenStatus = 401;
      }
      expect((await originalFetch(callback)).status).toBe(400);
      expect(data.$global?.openai).toBeUndefined();
      expect(
        authentication.getSignInStatus({ attemptId: result.attemptId }).status,
      ).toBe("error");
      expect(
        JSON.stringify(
          authentication.getSignInStatus({ attemptId: result.attemptId }),
        ),
      ).not.toContain("secret body");
      expect(data[OPENAI_AUTH_SCOPE]?.openai).toMatchObject({
        data: { clientId: "oaiapp_test" },
      });
    });
  }
  it("should cancel, release the callback port, and reject unsupported providers", async () => {
    const { result, callback } = await begin();
    expect(
      authentication.cancelSignIn({ attemptId: result.attemptId }).status,
    ).toBe("cancelled");
    await expect(originalFetch(callback)).rejects.toThrow();
    expect(data.$global?.openai).toBeUndefined();
    await expect(
      authentication.beginSignIn({ providerId: "anthropic" as "openai" }),
    ).rejects.toThrow();
  });
  it("should reject concurrent attempts and dispose unfinished sign-in", async () => {
    const first = await begin();
    await expect(
      authentication.beginSignIn({ providerId: "openai" }),
    ).rejects.toThrow();
    authentication.dispose();
    expect(
      authentication.getSignInStatus({ attemptId: first.result.attemptId })
        .status,
    ).toBe("cancelled");
    await expect(
      authentication.beginSignIn({ providerId: "openai" }),
    ).rejects.toThrow();
  });
  it("should coalesce rotating refreshes and keep the latest complete token set", async () => {
    await signIn();
    const store = getGlobalCredentialStore();
    const credential = {
      ...data.$global!.openai,
      expiresAt: new Date(0).toISOString(),
    } as OAuthCredential;
    await store.set("openai", "$global", credential);
    const [first, second] = await Promise.all([
      refreshOpenAICredential(credential),
      refreshOpenAICredential(credential),
    ]);
    expect(first.accessToken).toBe(second.accessToken);
    expect(tokenRequests).toHaveLength(2);
    expect(tokenRequests[1]?.get("grant_type")).toBe("refresh_token");
    expect(tokenRequests[1]?.get("client_id")).toBe("oaiapp_test");
    expect(data.$global?.openai).toMatchObject({
      refreshToken: "rotated-refresh",
    });
  });
  it("should use streaming non-stored Responses even for AI SDK generateText", async () => {
    await signIn();
    const response = {
      id: "resp_test",
      object: "response",
      created_at: 1,
      model: "test-model",
      status: "completed",
      output: [
        {
          type: "message",
          id: "msg_test",
          role: "assistant",
          status: "completed",
          content: [{ type: "output_text", text: "Hello", annotations: [] }],
        },
      ],
      usage: { input_tokens: 2, output_tokens: 1, total_tokens: 3 },
    };
    streamEvents = `data: ${JSON.stringify({ type: "response.completed", response })}\n\n`;
    const model = createOpenAISubscriptionProvider(data.$global!.openai!)(
      "test-model",
    );
    const result = await generateText({
      model,
      prompt: "Hello",
      maxRetries: 0,
    });
    expect(result.text).toBe("Hello");
    expect(requestBodies[0]).toMatchObject({ stream: true, store: false });
  });
  it("should fail a response that ends without completion", async () => {
    await signIn();
    streamEvents = 'data: {"type":"response.failed"}\n\n';
    const model = createOpenAISubscriptionProvider(data.$global!.openai!)(
      "test-model",
    );
    await expect(
      generateText({ model, prompt: "Hello", maxRetries: 0 }),
    ).rejects.toThrow();
  });
  for (const streaming of [false, true]) {
    it(`should replay non-stored history as content for ${streaming ? "streaming" : "generation"}`, async () => {
      await signIn();
      streamEvents = `data: ${JSON.stringify({
        type: "response.completed",
        response: {
          id: "resp_next",
          created_at: 1,
          model: "test-model",
          status: "completed",
          output: [],
          usage: { input_tokens: 2, output_tokens: 1, total_tokens: 3 },
        },
      })}\n\n`;
      const model = createOpenAISubscriptionProvider(data.$global!.openai!)(
        "test-model",
      );
      if (typeof model === "string" || model.specificationVersion !== "v3") {
        throw new Error("Expected a current Responses model.");
      }
      const parameters = {
        prompt: [
          {
            role: "user" as const,
            content: [{ type: "text" as const, text: "Hello" }],
          },
          {
            role: "assistant" as const,
            content: [
              {
                type: "reasoning" as const,
                text: "Summary",
                providerOptions: {
                  openai: {
                    itemId: "rs_previous",
                    reasoningEncryptedContent: "encrypted-state",
                  },
                },
              },
              {
                type: "text" as const,
                text: "Hello back",
                providerOptions: { openai: { itemId: "msg_previous" } },
              },
              {
                type: "tool-call" as const,
                toolCallId: "call_previous",
                toolName: "lookup",
                input: {},
                providerOptions: { openai: { itemId: "fc_previous" } },
              },
            ],
          },
          {
            role: "tool" as const,
            content: [
              {
                type: "tool-result" as const,
                toolCallId: "call_previous",
                toolName: "lookup",
                output: { type: "text" as const, value: "Found" },
              },
            ],
          },
        ],
        providerOptions: {
          openai: { store: true, forceReasoning: true, reasoningEffort: "low" },
        },
      };
      if (streaming) {
        const result = await model.doStream(parameters);
        await result.stream.pipeTo(new WritableStream({ write() {} }));
      } else {
        await model.doGenerate(parameters);
      }
      expect(requestBodies[0]).toMatchObject({
        store: false,
        stream: true,
        reasoning: { effort: "low" },
        include: ["reasoning.encrypted_content"],
        input: [
          { role: "user", content: [{ type: "input_text", text: "Hello" }] },
          {
            type: "reasoning",
            id: "rs_previous",
            encrypted_content: "encrypted-state",
            summary: [{ type: "summary_text", text: "Summary" }],
          },
          {
            role: "assistant",
            content: [{ type: "output_text", text: "Hello back" }],
          },
          {
            type: "function_call",
            call_id: "call_previous",
            name: "lookup",
            arguments: "{}",
          },
          {
            type: "function_call_output",
            call_id: "call_previous",
            output: "Found",
          },
        ],
      });
    });
  }
  it("should keep a credential changed during browser sign-in", async () => {
    const { callback } = await begin();
    await getGlobalCredentialStore().set("openai", "$global", {
      type: "api",
      key: "replacement",
    });
    expect((await originalFetch(callback)).status).toBe(400);
    expect(data.$global?.openai).toEqual({ type: "api", key: "replacement" });
  });

  it("should reject an interrupted streaming response rather than report success", async () => {
    await signIn();
    streamEvents =
      'data: {"type":"response.created","response":{"id":"resp_stream","created_at":1,"model":"test-model"}}\n\n';
    const model = createOpenAISubscriptionProvider(data.$global!.openai!)(
      "test-model",
    );
    if (typeof model === "string" || model.specificationVersion !== "v3") {
      throw new Error("Expected a current Responses model.");
    }
    const result = await model.doStream({
      prompt: [{ role: "user", content: [{ type: "text", text: "Hello" }] }],
    });
    const reader = result.stream.getReader();
    const consume = async () => {
      while (!(await reader.read()).done) {
        /* Read through the terminal event. */
      }
    };
    await expect(consume()).rejects.toThrow("ended before completion");
  });
});
