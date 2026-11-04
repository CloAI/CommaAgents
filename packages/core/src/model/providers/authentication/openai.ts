import type { ProviderFactory } from "../../model.types";
import { z } from "zod/v4";
import { createOpenAI } from "@ai-sdk/openai";
import { wrapLanguageModel } from "ai";
import type {
  CredentialStore,
  Credential,
} from "../../../credentials/credentials.types";
import type { OAuthCredential } from "../../../credentials/credentials.schema";
import { getGlobalCredentialStore } from "../../../credentials";
import { OPENAI_RESOURCE, OPENAI_PLAN_SCOPE } from "./openai.constants";
import {
  authenticationError,
  createOpenAICredential,
  requestOpenAITokens,
  sessionMetadataSchema,
  validateOpenAIIdentity,
} from "./openai.utils";

const refreshes = new WeakMap<
  CredentialStore,
  Map<string, Promise<OAuthCredential>>
>();

/** Resolve a usable subscription credential; coalesce rotating refreshes within a store.
 * @param {OAuthCredential} credential - Current account credentials.
 * @param {CredentialStore} store - Store owning the rotating token set.
 * @returns {Promise<OAuthCredential>} Unexpired credential.
 */
export async function refreshOpenAICredential(
  credential: OAuthCredential,
  store: CredentialStore = getGlobalCredentialStore(),
): Promise<OAuthCredential> {
  const metadata = sessionMetadataSchema.safeParse(credential.metadata);
  if (!metadata.success || !metadata.data.scopes.includes(OPENAI_PLAN_SCOPE)) {
    throw authenticationError(
      "Reconnect ChatGPT to enable subscription usage.",
    );
  }
  if (!credential.expiresAt) {
    throw authenticationError("Reconnect ChatGPT to renew its credentials.");
  }
  if (Date.parse(credential.expiresAt) > Date.now() + 60_000) {
    return credential;
  }
  if (!credential.refreshToken) {
    throw authenticationError("Your ChatGPT session expired. Sign in again.");
  }
  let active = refreshes.get(store);
  if (!active) {
    active = new Map();
    refreshes.set(store, active);
  }
  const existing = active.get(metadata.data.clientId);
  if (existing) {
    return existing;
  }
  const refresh = (async () => {
    try {
      const current = await store.get("openai", "$global");
      if (
        current?.type !== "oauth" ||
        current.accessToken !== credential.accessToken
      ) {
        if (
          current?.type === "oauth" &&
          current.metadata?.clientId === metadata.data.clientId
        ) {
          return current;
        }
        throw authenticationError(
          "ChatGPT configuration changed. Retry your request.",
        );
      }
      const tokens = await requestOpenAITokens(
        new URLSearchParams({
          grant_type: "refresh_token",
          client_id: metadata.data.clientId,
          refresh_token: credential.refreshToken!,
        }),
      );
      if (tokens.id_token) {
        const identity = await validateOpenAIIdentity(
          tokens.id_token,
          metadata.data.clientId,
        );
        if (identity.subject !== metadata.data.subject) {
          throw authenticationError();
        }
      }
      const updated = createOpenAICredential(tokens, metadata.data);
      updated.refreshToken ??= credential.refreshToken;
      // Compare inside the store's mutation queue, including removals queued during refresh.
      await store.set("openai", "$global", updated, credential);
      return updated;
    } catch {
      throw authenticationError(
        "ChatGPT session could not be renewed. Sign in again.",
      );
    }
  })();
  active.set(metadata.data.clientId, refresh);
  try {
    return await refresh;
  } finally {
    active.delete(metadata.data.clientId);
  }
}

/** List the subscription account's visible models without generation or retries.
 * @param {OAuthCredential} credential - Selected account.
 * @param {AbortSignal} [signal] - Caller cancellation.
 * @returns {Promise<object[]>} Visible provider-local model IDs.
 */
export async function listOpenAISubscriptionModels(
  credential: OAuthCredential,
  signal?: AbortSignal,
) {
  const current = await refreshOpenAICredential(credential);
  const timeout = AbortSignal.timeout(5_000);
  const response = await fetch(`${OPENAI_RESOURCE}/models`, {
    headers: { Authorization: `Bearer ${current.accessToken}` },
    redirect: "error",
    signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
  });
  if (!response.ok) {
    throw authenticationError(
      "ChatGPT model discovery failed. Check access or reconnect.",
    );
  }
  const payload: unknown = await response.json();
  const parsed = z
    .object({
      models: z.array(
        z.object({
          slug: z.string().min(1),
          display_name: z.string(),
          visibility: z.string(),
        }),
      ),
    })
    .safeParse(payload);
  if (!parsed.success) {
    throw authenticationError("ChatGPT returned an invalid model list.");
  }
  return parsed.data.models
    .filter((model) => model.visibility === "list")
    .map((model) => ({
      id: model.slug,
      sources: ["provider"] as const,
      metadata: { name: model.display_name },
    }));
}

/** Validate terminal events while preserving streaming and non-streaming AI SDK callers.
 * @param {Response} response - Live Responses event stream.
 * @param {boolean} streaming - Whether the caller consumes events directly.
 * @returns {Promise<Response>} Validated stream or its completed response payload.
 */
async function subscriptionResponse(
  response: Response,
  streaming: boolean,
): Promise<Response> {
  if (!response.body) {
    throw authenticationError("ChatGPT returned no response stream.");
  }
  const decoder = new TextDecoder();
  let buffer = "";
  let completedPayload: unknown;
  const body = response.body.pipeThrough(
    new TransformStream<Uint8Array, Uint8Array>({
      transform(chunk, controller) {
        buffer = (buffer + decoder.decode(chunk, { stream: true })).replace(
          /\r\n/g,
          "\n",
        );
        let boundary: number;
        while ((boundary = buffer.indexOf("\n\n")) >= 0) {
          const event = buffer.slice(0, boundary);
          buffer = buffer.slice(boundary + 2);
          const data = event
            .split("\n")
            .filter((line) => line.startsWith("data:"))
            .map((line) => line.slice(5).trimStart())
            .join("\n");
          if (!data || data === "[DONE]") {
            continue;
          }
          const parsed: unknown = JSON.parse(data);
          if (!parsed || typeof parsed !== "object" || !("type" in parsed)) {
            continue;
          }
          if (parsed.type === "response.completed" && "response" in parsed) {
            completedPayload = parsed.response;
          }
          if (
            ["response.failed", "response.incomplete", "error"].includes(
              String(parsed.type),
            )
          ) {
            throw authenticationError(
              "ChatGPT did not complete this response. Check your plan usage or reconnect.",
            );
          }
        }
        controller.enqueue(chunk);
      },
      flush() {
        if (!completedPayload) {
          throw authenticationError(
            "ChatGPT response ended before completion.",
          );
        }
      },
    }),
  );
  if (streaming) {
    return new Response(body, {
      status: response.status,
      statusText: response.statusText,
      headers: response.headers,
    });
  }
  // Drain the validated stream without buffering deltas; only the completed payload is retained.
  await body.pipeTo(new WritableStream({ write() {} }));
  return Response.json(completedPayload);
}

/** Create Responses models whose bearer token is renewed before every inference request.
 * @param {Credential} credential - Subscription registration selected by the resolver.
 * @returns {ProviderFactory} AI SDK Responses model factory.
 */
export function createOpenAISubscriptionProvider(
  credential: Credential,
): ProviderFactory {
  if (credential.type !== "oauth") {
    throw authenticationError();
  }
  const store = getGlobalCredentialStore();
  const clientId = sessionMetadataSchema.parse(credential.metadata).clientId;
  const provider = createOpenAI({
    apiKey: "oauth-managed-by-core",
    baseURL: OPENAI_RESOURCE,
    fetch: Object.assign(
      async (
        input: Parameters<typeof fetch>[0],
        options?: Parameters<typeof fetch>[1],
      ) => {
        if (String(input) !== `${OPENAI_RESOURCE}/responses`) {
          throw authenticationError(
            "ChatGPT subscription usage requires the Responses API.",
          );
        }
        const effective = await store.resolve("openai");
        if (
          effective?.type !== "oauth" ||
          effective.metadata?.clientId !== clientId
        ) {
          throw authenticationError(
            "ChatGPT configuration changed. Resolve the model again.",
          );
        }
        const current = await refreshOpenAICredential(effective, store);
        const body: Record<string, unknown> = JSON.parse(String(options?.body));
        const streaming = body.stream === true;
        const headers = new Headers(options?.headers);
        headers.set("Authorization", `Bearer ${current.accessToken}`);
        const response = await fetch(`${OPENAI_RESOURCE}/responses`, {
          ...options,
          headers,
          redirect: "error",
          body: JSON.stringify({ ...body, store: false, stream: true }),
        });
        return !response.ok
          ? response
          : subscriptionResponse(response, streaming);
      },
      { preconnect: fetch.preconnect },
    ),
  });
  return (modelId: string) =>
    wrapLanguageModel({
      model: provider.responses(modelId),
      middleware: {
        specificationVersion: "v3",
        // The SDK must know storage is disabled before converting history to item references.
        transformParams: async ({ params }) => ({
          ...params,
          providerOptions: {
            ...params.providerOptions,
            openai: { ...params.providerOptions?.openai, store: false },
          },
        }),
      },
    });
}
