import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createCredentialStore,
  getGlobalCredentialStore,
  setGlobalCredentialStore,
} from "../../../credentials";
import { createProviderAuthentication } from "./authentication";
import { refreshCopilotCredential } from "./copilot";
import { COPILOT_CLIENT_ID } from "./copilot.constants";
import { listCopilotModels } from "../listers/copilot";
import { getGlobalProviderResolver } from "../provider-resolver";
import { generateText } from "ai";
import type { CredentialStoreData } from "../../../credentials/credentials.types";
import type { OAuthCredential } from "../../../credentials/credentials.schema";

const previousStore = getGlobalCredentialStore();
const originalFetch = globalThis.fetch;
let authentication: ReturnType<typeof createProviderAuthentication>;
let tokenResponse: Record<string, unknown>;
let deviceLifetime: number;
let requests: {
  url: string;
  body: Record<string, unknown>;
  headers: Headers;
}[];

beforeEach(() => {
  let data: CredentialStoreData = {};
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
  tokenResponse = {
    access_token: "github-access",
    refresh_token: "github-refresh",
    expires_in: 28800,
    refresh_token_expires_in: 15897600,
  };
  deviceLifetime = 60;
  requests = [];
  vi.spyOn(globalThis, "fetch").mockImplementation(
    Object.assign(
      async (
        input: Parameters<typeof fetch>[0],
        options?: Parameters<typeof fetch>[1],
      ) => {
        const url = String(input);
        requests.push({
          url,
          body: options?.body ? JSON.parse(String(options.body)) : {},
          headers: new Headers(options?.headers),
        });
        if (url.endsWith("/device/code")) {
          return Response.json({
            device_code: "private-device-code",
            user_code: "ABCD-EFGH",
            verification_uri: "https://github.com/login/device",
            expires_in: deviceLifetime,
            interval: 0.001,
          });
        }
        if (url.endsWith("/oauth/access_token")) {
          return Response.json(tokenResponse);
        }
        if (url.endsWith("/models")) {
          return Response.json({
            data: [
              {
                id: "gpt-test",
                name: "Test",
                model_picker_enabled: true,
                policy: { state: "enabled" },
              },
            ],
          });
        }
        if (url.endsWith("/chat/completions")) {
          return Response.json({
            id: "chat-test",
            created: 1,
            model: "gpt-test",
            choices: [
              {
                index: 0,
                message: { role: "assistant", content: "hello" },
                finish_reason: "stop",
              },
            ],
            usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
          });
        }
        throw new Error("Unexpected URL");
      },
      {},
    ),
  );
});
afterEach(() => {
  authentication.dispose();
  globalThis.fetch = originalFetch;
  setGlobalCredentialStore(previousStore);
});

async function expectStatus(attemptId: string, expected: string) {
  const deadline = Date.now() + 1000;
  while (
    authentication.getSignInStatus({ attemptId }).status === "pending" &&
    Date.now() < deadline
  ) {
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  expect(authentication.getSignInStatus({ attemptId }).status).toBe(expected);
}

async function expiredCredential(): Promise<OAuthCredential> {
  const credential: OAuthCredential = {
    type: "oauth",
    accessToken: "expired-access",
    refreshToken: "old-refresh",
    expiresAt: new Date(0).toISOString(),
    metadata: { clientId: COPILOT_CLIENT_ID },
  };
  await getGlobalCredentialStore().set("github-copilot", "$global", credential);
  return credential;
}

describe("GitHub Copilot authentication", () => {
  it("should expose only the user code and store the completed OAuth credential in core", async () => {
    const start = await authentication.beginSignIn({
      providerId: "github-copilot",
    });
    expect(start).toEqual({
      attemptId: expect.any(String),
      authorizationURL: "https://github.com/login/device",
      userCode: "ABCD-EFGH",
    });
    await expectStatus(start.attemptId, "connected");
    expect(
      await getGlobalCredentialStore().get("github-copilot", "$global"),
    ).toMatchObject({
      type: "oauth",
      accessToken: "github-access",
      refreshToken: "github-refresh",
      metadata: { clientId: COPILOT_CLIENT_ID },
    });
    expect(requests[1]?.body).toMatchObject({
      client_id: COPILOT_CLIENT_ID,
      device_code: "private-device-code",
      grant_type: "urn:ietf:params:oauth:grant-type:device_code",
    });
  });

  it("should keep existing credentials when access is denied", async () => {
    const original = await expiredCredential();
    tokenResponse = {
      error: "access_denied",
      error_description: "secret-provider-response",
    };
    const start = await authentication.beginSignIn({
      providerId: "github-copilot",
    });
    await expectStatus(start.attemptId, "error");
    expect(
      await getGlobalCredentialStore().get("github-copilot", "$global"),
    ).toEqual(original);
    expect(
      JSON.stringify(
        authentication.getSignInStatus({ attemptId: start.attemptId }),
      ),
    ).not.toContain("secret-provider-response");
  });

  it("should cancel polling without saving credentials", async () => {
    const start = await authentication.beginSignIn({
      providerId: "github-copilot",
    });
    expect(
      authentication.cancelSignIn({ attemptId: start.attemptId }).status,
    ).toBe("cancelled");
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(requests).toHaveLength(1);
    expect(
      await getGlobalCredentialStore().get("github-copilot", "$global"),
    ).toBeUndefined();
  });

  it("should expire an unanswered device attempt", async () => {
    tokenResponse = { error: "authorization_pending" };
    deviceLifetime = 0.01;
    const start = await authentication.beginSignIn({
      providerId: "github-copilot",
    });
    await expectStatus(start.attemptId, "error");
    expect(
      await getGlobalCredentialStore().get("github-copilot", "$global"),
    ).toBeUndefined();
  });

  it("should preserve credentials edited while device sign-in is pending", async () => {
    const start = await authentication.beginSignIn({
      providerId: "github-copilot",
    });
    await getGlobalCredentialStore().set("github-copilot", "$global", {
      type: "api",
      key: "replacement",
    });
    await expectStatus(start.attemptId, "error");
    expect(
      await getGlobalCredentialStore().get("github-copilot", "$global"),
    ).toEqual({ type: "api", key: "replacement" });
  });

  it("should coalesce refreshes and discover models with the renewed token", async () => {
    const credential = await expiredCredential();
    const [first, second] = await Promise.all([
      refreshCopilotCredential(credential),
      refreshCopilotCredential(credential),
    ]);
    expect(first).toEqual(second);
    expect(requests).toHaveLength(1);
    expect(requests[0]?.body).toMatchObject({
      grant_type: "refresh_token",
      refresh_token: "old-refresh",
    });
    expect(await listCopilotModels({ credential: first })).toMatchObject([
      { id: "gpt-test", sources: ["provider"] },
    ]);
    expect(requests.at(-1)?.headers.get("Authorization")).toBe(
      "Bearer github-access",
    );
  });

  it("should renew an expired credential during model refresh", async () => {
    const credential = await expiredCredential();
    await listCopilotModels({ credential });
    expect(requests.map((request) => request.url)).toEqual([
      "https://github.com/login/oauth/access_token",
      "https://api.githubcopilot.com/models",
    ]);
    expect(requests.at(-1)?.headers.get("Authorization")).toBe(
      "Bearer github-access",
    );
  });

  it("should renew tokens for inference through the built-in Copilot provider", async () => {
    const credential = await expiredCredential();
    const provider = await getGlobalProviderResolver()(
      "github-copilot",
      credential,
    );
    const result = await generateText({
      model: provider("gpt-test"),
      prompt: "Hi",
      maxRetries: 0,
    });
    expect(result.text).toBe("hello");
    expect(requests.at(-1)?.headers.get("Authorization")).toBe(
      "Bearer github-access",
    );
  });
});
