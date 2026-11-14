import { randomUUID } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";
import { z } from "zod/v4";
import { getGlobalCredentialStore } from "../../../credentials";
import type { CredentialStore } from "../../../credentials/credentials.types";
import type { OAuthCredential } from "../../../credentials/credentials.schema";
import type { ProviderSignInStatus } from "./authentication.types";
import { COPILOT_CLIENT_ID, COPILOT_TOKEN_URL } from "./copilot.constants";
import {
  copilotTokensSchema,
  createCopilotCredential,
  requestCopilotOAuth,
} from "./copilot.utils";

const refreshes = new WeakMap<
  CredentialStore,
  Map<string, Promise<OAuthCredential>>
>();

/** Renew managed GitHub tokens once per store, preserving concurrent credential edits.
 * @param {OAuthCredential} credential - Selected GitHub account credential.
 * @param {CredentialStore} store - Store owning the rotating token set.
 * @param {AbortSignal} [signal] - Caller cancellation.
 * @returns {Promise<OAuthCredential>} Usable credential.
 */
export async function refreshCopilotCredential(
  credential: OAuthCredential,
  store = getGlobalCredentialStore(),
  signal?: AbortSignal,
): Promise<OAuthCredential> {
  if (
    credential.metadata?.clientId !== COPILOT_CLIENT_ID ||
    !credential.expiresAt ||
    Date.parse(credential.expiresAt) > Date.now() + 60_000
  ) {
    return credential;
  }
  if (
    !credential.refreshToken ||
    (typeof credential.metadata?.refreshExpiresAt === "string" &&
      Date.parse(credential.metadata.refreshExpiresAt) <= Date.now())
  ) {
    throw new Error("GitHub Copilot session expired. Please sign in again.");
  }
  let active = refreshes.get(store);
  if (!active) {
    active = new Map();
    refreshes.set(store, active);
  }
  const existing = active.get(credential.accessToken);
  if (existing) {
    return existing;
  }
  const refresh = (async () => {
    const current = await store.resolve("github-copilot");
    if (
      current?.type === "oauth" &&
      current.accessToken !== credential.accessToken &&
      current.metadata?.clientId === COPILOT_CLIENT_ID &&
      current.expiresAt &&
      Date.parse(current.expiresAt) > Date.now() + 60_000
    ) {
      return current;
    }
    if (
      current?.type !== "oauth" ||
      current.accessToken !== credential.accessToken
    ) {
      throw new Error(
        "GitHub Copilot configuration changed. Retry your request.",
      );
    }
    const tokens = copilotTokensSchema.parse(
      await requestCopilotOAuth(
        COPILOT_TOKEN_URL,
        {
          grant_type: "refresh_token",
          refresh_token: credential.refreshToken!,
        },
        signal,
      ),
    );
    const updated = createCopilotCredential(tokens, credential);
    await store.set("github-copilot", "$global", updated, credential);
    return updated;
  })();
  active.set(credential.accessToken, refresh);
  try {
    return await refresh;
  } finally {
    active.delete(credential.accessToken);
  }
}

/** Begin a bounded device flow; only the user code and authorization URL leave core.
 * @param {AbortSignal} signal - Authentication lifetime cancellation.
 * @returns {Promise<object>} Internal attempt controls and public authorization information.
 */
export async function beginCopilotSignIn(signal: AbortSignal) {
  const store = getGlobalCredentialStore();
  const initialCredential = await store.get("github-copilot", "$global");
  const device = z
    .object({
      device_code: z.string().min(1),
      user_code: z.string().min(1),
      verification_uri: z.literal("https://github.com/login/device"),
      expires_in: z.number().positive().max(3600),
      interval: z.number().positive().default(5),
    })
    .parse(
      await requestCopilotOAuth(
        "https://github.com/login/device/code",
        {},
        signal,
      ),
    );
  signal.throwIfAborted();
  const controller = new AbortController();
  const timeout = setTimeout(() => {
    if (!committing) {
      progress.status = "error";
      progress.message = "GitHub sign-in timed out. Please try again.";
      controller.abort();
    }
  }, device.expires_in * 1000);
  const progress: ProviderSignInStatus = {
    attemptId: randomUUID(),
    status: "pending",
  };
  let committing = false;
  const stop = () => {
    clearTimeout(timeout);
    controller.abort();
  };
  const pollingSignal = AbortSignal.any([signal, controller.signal]);
  void (async () => {
    let interval = device.interval * 1000;
    try {
      while (progress.status === "pending") {
        await delay(interval, undefined, { signal: pollingSignal });
        const tokens = copilotTokensSchema.parse(
          await requestCopilotOAuth(
            COPILOT_TOKEN_URL,
            {
              device_code: device.device_code,
              grant_type: "urn:ietf:params:oauth:grant-type:device_code",
            },
            pollingSignal,
          ),
        );
        if (tokens.error === "authorization_pending") {
          continue;
        }
        if (tokens.error === "slow_down") {
          interval = Math.max(interval + 5000, (tokens.interval ?? 0) * 1000);
          continue;
        }
        const credential = createCopilotCredential(tokens);
        pollingSignal.throwIfAborted();
        committing = true;
        await store.set(
          "github-copilot",
          "$global",
          credential,
          initialCredential ?? null,
        );
        progress.status = "connected";
      }
    } catch {
      if (progress.status === "pending") {
        progress.status = "error";
        progress.message =
          "GitHub Copilot sign-in could not be completed. Existing credentials were kept. Please try again.";
      }
    } finally {
      stop();
    }
  })();
  return {
    progress,
    stop,
    isCommitting: () => committing,
    start: {
      attemptId: progress.attemptId,
      authorizationURL: device.verification_uri,
      userCode: device.user_code,
    },
  };
}
