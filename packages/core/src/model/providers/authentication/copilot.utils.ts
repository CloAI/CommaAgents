import { z } from "zod/v4";
import type { OAuthCredential } from "../../../credentials/credentials.schema";
import { COPILOT_CLIENT_ID, COPILOT_HEADERS } from "./copilot.constants";

export const copilotTokensSchema = z.object({
  access_token: z.string().min(1).optional(),
  refresh_token: z.string().min(1).optional(),
  expires_in: z.number().positive().optional(),
  refresh_token_expires_in: z.number().positive().optional(),
  error: z.string().optional(),
  interval: z.number().positive().optional(),
});

/** Request a GitHub OAuth response without including secrets in errors.
 * @param {string} url - GitHub OAuth endpoint.
 * @param {Record<string, string>} body - Grant parameters.
 * @param {AbortSignal} [signal] - Caller cancellation.
 * @returns {Promise<unknown>} Unvalidated response payload.
 */
export async function requestCopilotOAuth(
  url: string,
  body: Record<string, string>,
  signal?: AbortSignal,
): Promise<unknown> {
  const timeout = AbortSignal.timeout(15_000);
  const response = await fetch(url, {
    method: "POST",
    headers: { ...COPILOT_HEADERS, "Content-Type": "application/json" },
    body: JSON.stringify({ client_id: COPILOT_CLIENT_ID, ...body }),
    signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
    redirect: "error",
  });
  if (!response.ok) {
    throw new Error(
      "GitHub Copilot authorization failed. Please sign in again.",
    );
  }
  return response.json();
}

/** Preserve account metadata while replacing a GitHub token set.
 * @param {object} tokens - Validated GitHub token response.
 * @param {OAuthCredential} [previous] - Credential being renewed.
 * @returns {OAuthCredential} Complete token set for atomic storage.
 */
export function createCopilotCredential(
  tokens: z.output<typeof copilotTokensSchema>,
  previous?: OAuthCredential,
): OAuthCredential {
  if (!tokens.access_token || tokens.error) {
    throw new Error(
      "GitHub Copilot authorization failed. Please sign in again.",
    );
  }
  return {
    ...previous,
    type: "oauth",
    accessToken: tokens.access_token,
    refreshToken: tokens.refresh_token ?? previous?.refreshToken,
    expiresAt: tokens.expires_in
      ? new Date(Date.now() + tokens.expires_in * 1000).toISOString()
      : undefined,
    metadata: {
      ...previous?.metadata,
      clientId: COPILOT_CLIENT_ID,
      ...(tokens.refresh_token_expires_in
        ? {
            refreshExpiresAt: new Date(
              Date.now() + tokens.refresh_token_expires_in * 1000,
            ).toISOString(),
          }
        : {}),
    },
  };
}
