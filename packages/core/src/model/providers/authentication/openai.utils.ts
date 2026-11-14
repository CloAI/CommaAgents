import { z } from "zod/v4";
import { createRemoteJWKSet, jwtVerify } from "jose";
import type { OAuthCredential } from "../../../credentials/credentials.schema";
import {
  OPENAI_ISSUER,
  OPENAI_PLAN_SCOPE,
  OPENAI_TOKEN_URL,
  OPENAI_RESOURCE,
} from "./openai.constants";

export const registrationSchema = z.object({
  hostId: z.string(),
  clientId: z.string().optional(),
  subject: z.string().optional(),
  email: z.string().optional(),
});
export const sessionMetadataSchema = z.object({
  clientId: z.string().min(1),
  subject: z.string().min(1),
  email: z.string().optional(),
  scopes: z.array(z.string()),
  idToken: z.string(),
});
const tokenSchema = z.object({
  access_token: z.string().min(1),
  refresh_token: z.string().min(1).optional(),
  id_token: z.string().min(1).optional(),
  token_type: z.literal("Bearer"),
  expires_in: z.number().positive(),
  scope: z.string().optional(),
});
const signingKeys = createRemoteJWKSet(
  new URL(`${OPENAI_ISSUER}/.well-known/jwks.json`),
);

/** Create a safe authentication failure without provider bodies or tokens.
 * @param {string} message - Safe user-facing explanation.
 * @returns {Error} Authentication error with a stable code.
 */
export function authenticationError(
  message = "ChatGPT sign-in failed. Please try again.",
) {
  return Object.assign(new Error(message), {
    code: "PROVIDER_AUTHENTICATION_ERROR",
  });
}

/** Exchange an authorization code or rotating refresh token at the fixed official endpoint.
 * @param {URLSearchParams} parameters - Grant fields, retained in core only.
 * @param {AbortSignal} [signal] - Owning sign-in cancellation.
 * @returns {Promise<object>} Validated token set.
 */
export async function requestOpenAITokens(
  parameters: URLSearchParams,
  signal?: AbortSignal,
) {
  parameters.set("resource", OPENAI_RESOURCE);
  const timeout = AbortSignal.timeout(8_000);
  const response = await fetch(OPENAI_TOKEN_URL, {
    method: "POST",
    redirect: "error",
    signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: parameters,
  });
  if (!response.ok) {
    throw authenticationError(
      "ChatGPT authorization expired or was rejected. Sign in again.",
    );
  }
  const parsed = tokenSchema.safeParse(await response.json());
  if (!parsed.success) {
    throw authenticationError();
  }
  return parsed.data;
}

/** Verify signed identity, the selected registration, and nonce before activating credentials.
 * @param {string} idToken - Signed OpenAI identity token.
 * @param {string} clientId - Issued application registration.
 * @param {string} [nonce] - Original sign-in challenge; omitted for refresh.
 * @returns {Promise<object>} Verified subject and optional email.
 */
export async function validateOpenAIIdentity(
  idToken: string,
  clientId: string,
  nonce?: string,
) {
  const { payload } = await jwtVerify(idToken, signingKeys, {
    issuer: OPENAI_ISSUER,
    audience: clientId,
    requiredClaims: ["exp", "sub", "iat", ...(nonce ? ["nonce"] : [])],
  });
  if ((nonce && payload.nonce !== nonce) || !payload.sub) {
    throw authenticationError();
  }
  return {
    subject: payload.sub,
    ...(typeof payload.email === "string" ? { email: payload.email } : {}),
  };
}

/** Build a complete credential only when ChatGPT plan usage was actually granted.
 * @param {object} tokens - Validated token response.
 * @param {object} metadata - Verified registration and account.
 * @returns {OAuthCredential} Complete credential for atomic storage.
 */
export function createOpenAICredential(
  tokens: z.output<typeof tokenSchema>,
  metadata: z.output<typeof sessionMetadataSchema>,
): OAuthCredential {
  const scopes =
    tokens.scope === undefined
      ? metadata.scopes
      : tokens.scope.split(/\s+/).filter(Boolean);
  if (!scopes.includes(OPENAI_PLAN_SCOPE)) {
    throw authenticationError(
      "ChatGPT plan usage was not enabled. Sign in again and grant plan access.",
    );
  }
  return {
    type: "oauth",
    accessToken: tokens.access_token,
    refreshToken: tokens.refresh_token,
    expiresAt: new Date(Date.now() + tokens.expires_in * 1000).toISOString(),
    accountId: metadata.subject,
    metadata: {
      ...metadata,
      scopes,
      idToken: tokens.id_token ?? metadata.idToken,
    },
  };
}
