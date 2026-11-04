import { beginCopilotSignIn } from "./copilot";
import { createServer } from "node:http";
import { randomBytes, createHash, randomUUID } from "node:crypto";
import { getGlobalCredentialStore } from "../../../credentials";
import type {
  ProviderAuthentication,
  ProviderSignInStatus,
} from "./authentication.types";
import {
  ProviderSignInArgumentsSchema,
  ProviderSignInAttemptArgumentsSchema,
} from "./authentication.schemas";
import {
  OPENAI_AUTH_SCOPE,
  OPENAI_ISSUER,
  OPENAI_RESOURCE,
  SIGN_IN_TIMEOUT_MS,
} from "./openai.constants";
import {
  authenticationError,
  registrationSchema,
  requestOpenAITokens,
  validateOpenAIIdentity,
  createOpenAICredential,
} from "./openai.utils";

/**
 * Own one interactive subscription sign-in at a time. Core handles OAuth and
 * credentials; callers open the URL and read progress. GitHub uses device polling.
 * The loopback callback requires the browser and core process on the same host.
 * @returns {ProviderAuthentication} A bounded sign-in lifetime owned by the caller.
 */
export function createProviderAuthentication(): ProviderAuthentication {
  let attempt:
    | {
        progress: ProviderSignInStatus;
        stop: () => void;
        isCommitting: () => boolean;
      }
    | undefined;
  const lifetime = new AbortController();
  let disposed = false;
  let starting = false;
  function findAttempt(options: { readonly attemptId: string }) {
    const parsed = ProviderSignInAttemptArgumentsSchema.safeParse(options);
    if (
      !parsed.success ||
      !attempt ||
      parsed.data.attemptId !== attempt.progress.attemptId
    ) {
      throw authenticationError(
        "Sign-in attempt was not found. Start sign-in again.",
      );
    }
    return attempt;
  }
  return {
    async beginSignIn(options) {
      if (!ProviderSignInArgumentsSchema.safeParse(options).success) {
        throw authenticationError(
          "Subscription sign-in is not supported for this provider.",
        );
      }
      if (disposed || starting || attempt?.progress.status === "pending") {
        throw authenticationError(
          "A sign-in is already pending or authentication has been closed.",
        );
      }
      starting = true;
      const store = getGlobalCredentialStore();
      try {
        if (options.providerId === "github-copilot") {
          const copilot = await beginCopilotSignIn(lifetime.signal);
          attempt = copilot;
          return copilot.start;
        }
        const initialCredential = await store.get("openai", "$global");
        const saved = await store.get("openai", OPENAI_AUTH_SCOPE);
        const registration =
          saved?.type === "custom"
            ? registrationSchema.parse(saved.data)
            : { hostId: `urn:uuid:${randomUUID()}` };
        // Persist installation identity before sending it to OpenAI. Keep the issued
        // registration after local credential removal so reconnect reuses our client.
        await store.set("openai", OPENAI_AUTH_SCOPE, {
          type: "custom",
          data: registration,
        });
        if (disposed) {
          throw authenticationError();
        }
        const state = randomBytes(32).toString("base64url");
        const nonce = randomBytes(32).toString("base64url");
        const verifier = randomBytes(48).toString("base64url");
        const controller = new AbortController();
        const progress: ProviderSignInStatus = {
          attemptId: randomUUID(),
          status: "pending",
        };
        let exchanging = false;
        let committing = false;
        const server = createServer((request, response) => {
          const callback = new URL(request.url ?? "/", "http://127.0.0.1");
          const reply = (status: number, message: string) => {
            response.writeHead(status, {
              "Content-Type": "text/plain; charset=utf-8",
              "Cache-Control": "no-store",
              "Content-Security-Policy": "default-src 'none'",
              "X-Content-Type-Options": "nosniff",
            });
            response.end(message);
          };
          if (
            request.method !== "GET" ||
            callback.pathname !== "/auth/callback"
          ) {
            reply(404, "Not found.");
            return;
          }
          if (callback.searchParams.get("state") !== state) {
            reply(400, "Invalid sign-in state.");
            return;
          }
          if (exchanging || progress.status !== "pending") {
            reply(409, "Sign-in has already been handled.");
            return;
          }
          exchanging = true;
          void (async () => {
            try {
              if (callback.searchParams.has("error")) {
                throw authenticationError(
                  "ChatGPT sign-in was declined. Your existing credentials were kept.",
                );
              }
              const clientId =
                callback.searchParams.get("client_id") ?? registration.clientId;
              const code = callback.searchParams.get("code");
              if (
                !code ||
                !clientId ||
                clientId === "dynamic_agent_client" ||
                (registration.clientId && clientId !== registration.clientId)
              ) {
                throw authenticationError();
              }
              // Retain the issued client even if exchange fails, avoiding duplicate registration.
              await store.set("openai", OPENAI_AUTH_SCOPE, {
                type: "custom",
                data: { ...registration, clientId },
              });
              const tokens = await requestOpenAITokens(
                new URLSearchParams({
                  grant_type: "authorization_code",
                  client_id: clientId,
                  code,
                  code_verifier: verifier,
                  redirect_uri: redirectURI,
                }),
                controller.signal,
              );
              if (!tokens.id_token || tokens.scope === undefined) {
                throw authenticationError();
              }
              const identity = await validateOpenAIIdentity(
                tokens.id_token,
                clientId,
                nonce,
              );
              if (
                registration.subject &&
                identity.subject !== registration.subject
              ) {
                throw authenticationError(
                  "The signed-in account does not match this registration.",
                );
              }
              const credential = createOpenAICredential(tokens, {
                clientId,
                ...identity,
                scopes: [],
                idToken: tokens.id_token,
              });
              if (controller.signal.aborted) {
                throw authenticationError();
              }
              await store.set("openai", OPENAI_AUTH_SCOPE, {
                type: "custom",
                data: { ...registration, clientId, ...identity },
              });
              if (controller.signal.aborted) {
                throw authenticationError();
              }
              committing = true;
              await store.set(
                "openai",
                "$global",
                credential,
                initialCredential ?? null,
              );
              progress.status = "connected";
              reply(
                200,
                "Connected to ChatGPT. You can close this tab and return to Comma Agents.",
              );
            } catch {
              if (progress.status === "pending") {
                progress.status = "error";
                progress.message =
                  "ChatGPT sign-in could not be completed. Check that plan access was granted and try again. Existing credentials were kept.";
              }
              reply(
                400,
                "ChatGPT sign-in did not complete. Return to Comma Agents to try again.",
              );
            } finally {
              stop();
            }
          })();
        });
        await new Promise<void>((resolve, reject) => {
          server.once("error", reject);
          server.listen(0, "127.0.0.1", () => {
            server.removeListener("error", reject);
            resolve();
          });
        });
        const address = server.address();
        if (!address || typeof address === "string") {
          server.close();
          throw authenticationError();
        }
        const redirectURI = `http://127.0.0.1:${address.port}/auth/callback`;
        const timeout = setTimeout(() => {
          progress.status = "error";
          progress.message = "Sign-in timed out. Please try again.";
          stop();
        }, SIGN_IN_TIMEOUT_MS);
        function stop() {
          clearTimeout(timeout);
          controller.abort();
          server.close();
          server.closeIdleConnections();
        }
        attempt = { progress, stop, isCommitting: () => committing };
        if (disposed) {
          progress.status = "cancelled";
          stop();
          throw authenticationError();
        }
        const authorization = new URL(
          `${OPENAI_ISSUER}/api/accounts/authorize`,
        );
        authorization.search = new URLSearchParams({
          client_id: registration.clientId ?? "dynamic_agent_client",
          ...(registration.clientId ? {} : { agent_name_hint: "Comma Agents" }),
          ext_agent_host_id: registration.hostId,
          response_type: "code",
          redirect_uri: redirectURI,
          scope:
            "openid profile email offline_access resource.invoke chatgpt.tokens.use.direct",
          resource: OPENAI_RESOURCE,
          state,
          nonce,
          code_challenge_method: "S256",
          code_challenge: createHash("sha256")
            .update(verifier)
            .digest("base64url"),
        }).toString();
        return {
          attemptId: progress.attemptId,
          authorizationURL: authorization.href,
        };
      } catch {
        throw authenticationError(
          options.providerId === "github-copilot"
            ? "GitHub Copilot sign-in failed. Please try again."
            : undefined,
        );
      } finally {
        starting = false;
      }
    },
    getSignInStatus(options) {
      return { ...findAttempt(options).progress };
    },
    cancelSignIn(options) {
      const current = findAttempt(options);
      if (current.progress.status === "pending" && !current.isCommitting()) {
        current.progress.status = "cancelled";
        current.stop();
      }
      return { ...current.progress };
    },
    dispose() {
      disposed = true;
      lifetime.abort();
      if (attempt?.progress.status === "pending") {
        if (!attempt.isCommitting()) {
          attempt.progress.status = "cancelled";
        }
        attempt.stop();
      }
    },
  };
}
