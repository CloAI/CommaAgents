/**
 * GitHub Copilot OAuth Device Flow — for GitHub App tokens.
 *
 * Implements RFC 8628 (Device Authorization Grant) against GitHub's OAuth
 * endpoints using the comma-agents GitHub App client ID.
 *
 * Key differences from a standard OAuth App:
 *   - No `scope` parameter (GitHub Apps use fine-grained permissions)
 *   - Access tokens are `ghu_*` prefixed, expire after 8 hours
 *   - Refresh tokens are `ghr_*` prefixed, expire after ~6 months
 *   - Token refresh does NOT require a client_secret when the token
 *     originated from the device flow
 *
 * OAuth credentials are stored using @comma-agents/core's OAuthCredential
 * type. Expiry uses ISO-8601 datetime strings, and `refreshExpiresAt` is
 * stored in the `metadata` field.
 *
 * @see https://docs.github.com/en/apps/creating-github-apps/authenticating-with-a-github-app/generating-a-user-access-token-for-a-github-app#using-the-device-flow-to-generate-a-user-access-token
 */

import type { OAuthCredential } from "@comma-agents/core";

// Constants

/** comma-agents GitHub App client ID. */
const CLIENT_ID = "Ov23ctjLWBsnGRRwrakq";

const DEVICE_CODE_URL = "https://github.com/login/device/code";
const ACCESS_TOKEN_URL = "https://github.com/login/oauth/access_token";

/**
 * Safety margin added to the polling interval to avoid hitting the server
 * slightly too early due to clock skew or timer drift.
 */
const POLLING_SAFETY_MARGIN_MS = 3_000;

/**
 * Buffer (in ms) subtracted from the access token lifetime when checking
 * expiry. We refresh 5 minutes early to avoid mid-request failures.
 */
const EXPIRY_BUFFER_MS = 5 * 60 * 1_000;

// Types

/** Result from GitHub's device code endpoint. */
export interface DeviceCodeResponse {
  /** The URL the user should visit to authorize. */
  readonly verificationUri: string;
  /** The code the user enters at the verification URL. */
  readonly userCode: string;
  /** Internal device code used for polling (not shown to user). */
  readonly deviceCode: string;
  /** Polling interval in seconds suggested by GitHub. */
  readonly interval: number;
  /** Seconds until the device code expires. */
  readonly expiresIn: number;
}

export type PollResult =
  | { readonly type: "success"; readonly auth: OAuthCredential }
  | { readonly type: "expired" }
  | { readonly type: "denied" }
  | { readonly type: "error"; readonly message: string };

// Device Flow — Step 1: Request device code

/**
 * Initiate the GitHub device authorization flow.
 *
 * Returns the device code response which contains the URL and code to show
 * the user, plus a `poll()` function to call repeatedly until authorization
 * completes (or fails / expires).
 */
export async function startDeviceFlow(): Promise<{
  device: DeviceCodeResponse;
  poll: () => Promise<PollResult>;
}> {
  const response = await fetch(DEVICE_CODE_URL, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ client_id: CLIENT_ID }),
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(
      `Failed to initiate device authorization (HTTP ${response.status}): ${body}`,
    );
  }

  const data = (await response.json()) as {
    verification_uri: string;
    user_code: string;
    device_code: string;
    interval: number;
    expires_in: number;
  };

  const device: DeviceCodeResponse = {
    verificationUri: data.verification_uri,
    userCode: data.user_code,
    deviceCode: data.device_code,
    interval: data.interval,
    expiresIn: data.expires_in,
  };

  return {
    device,
    poll: () => pollForToken(device),
  };
}

// Device Flow — Step 2: Poll for access token

/**
 * Poll GitHub's token endpoint until the user authorizes (or the code expires).
 *
 * This function blocks (via sleep) and handles the standard device flow
 * error codes: `authorization_pending`, `slow_down`, `expired_token`,
 * `access_denied`.
 */
async function pollForToken(device: DeviceCodeResponse): Promise<PollResult> {
  let interval = device.interval;

  while (true) {
    // Wait before each poll attempt
    await sleep(interval * 1_000 + POLLING_SAFETY_MARGIN_MS);

    const response = await fetch(ACCESS_TOKEN_URL, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        client_id: CLIENT_ID,
        device_code: device.deviceCode,
        grant_type: "urn:ietf:params:oauth:grant-type:device_code",
      }),
    });

    if (!response.ok) {
      return { type: "error", message: `HTTP ${response.status}` };
    }

    const data = (await response.json()) as {
      access_token?: string;
      token_type?: string;
      expires_in?: number;
      refresh_token?: string;
      refresh_token_expires_in?: number;
      error?: string;
      error_description?: string;
      interval?: number;
    };

    // Success — we have an access token
    if (data.access_token) {
      const auth = buildOAuthCredential(data);
      return { type: "success", auth };
    }

    // Standard device flow error codes
    if (data.error === "authorization_pending") {
      // User hasn't authorized yet — keep polling at the same rate
      continue;
    }

    if (data.error === "slow_down") {
      // RFC 8628 section 3.5: add 5 seconds to the interval
      interval += 5;
      // GitHub may also return a new interval value — prefer that if provided
      if (
        data.interval &&
        typeof data.interval === "number" &&
        data.interval > 0
      ) {
        interval = data.interval;
      }
      continue;
    }

    if (data.error === "expired_token") {
      return { type: "expired" };
    }

    if (data.error === "access_denied") {
      return { type: "denied" };
    }

    // Unknown error
    if (data.error) {
      return {
        type: "error",
        message: data.error_description ?? data.error,
      };
    }
  }
}

// Token Refresh

/**
 * Check whether a stored OAuth credential's access token has expired
 * (or will expire within the safety buffer).
 */
export function isExpired(credential: OAuthCredential): boolean {
  if (!credential.expiresAt) return false;
  const expiresAtMs = new Date(credential.expiresAt).getTime();
  // expiresAt of 0 (epoch) means never expires
  if (expiresAtMs === 0) return false;
  return Date.now() >= expiresAtMs - EXPIRY_BUFFER_MS;
}

/**
 * Check whether the refresh token itself has expired.
 * If `refreshExpiresAt` is not stored in metadata, assume it never expires.
 */
export function isRefreshExpired(credential: OAuthCredential): boolean {
  const refreshExpiresAt = credential.metadata?.refreshExpiresAt;
  if (refreshExpiresAt == null) return false;
  const expiresAtMs = new Date(refreshExpiresAt as string).getTime();
  if (expiresAtMs === 0) return false;
  return Date.now() >= expiresAtMs;
}

/**
 * Refresh an expired access token using the stored refresh token.
 *
 * For GitHub App tokens obtained via the device flow, the refresh endpoint
 * does NOT require a client_secret — only the client_id and refresh_token.
 *
 * Returns a new OAuthCredential with updated tokens and expiry timestamps,
 * or `undefined` if the refresh fails (e.g. refresh token itself expired).
 */
export async function refreshAccessToken(
  credential: OAuthCredential,
): Promise<OAuthCredential | undefined> {
  if (isRefreshExpired(credential)) {
    return undefined;
  }

  if (!credential.refreshToken) {
    return undefined;
  }

  const response = await fetch(ACCESS_TOKEN_URL, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      client_id: CLIENT_ID,
      grant_type: "refresh_token",
      refresh_token: credential.refreshToken,
    }),
  });

  if (!response.ok) {
    return undefined;
  }

  const data = (await response.json()) as {
    access_token?: string;
    expires_in?: number;
    refresh_token?: string;
    refresh_token_expires_in?: number;
    error?: string;
  };

  if (!data.access_token || data.error) {
    return undefined;
  }

  return buildOAuthCredential(data, credential.refreshToken);
}

// Helpers

/**
 * Build an OAuthCredential from a GitHub token endpoint response.
 *
 * Maps the GitHub response shape into core's OAuthCredential format:
 * - `access_token` -> `accessToken`
 * - `refresh_token` -> `refreshToken`
 * - `expires_in` -> `expiresAt` (converted to ISO-8601)
 * - `refresh_token_expires_in` -> `metadata.refreshExpiresAt` (ISO-8601)
 */
function buildOAuthCredential(
  data: {
    access_token?: string;
    expires_in?: number;
    refresh_token?: string;
    refresh_token_expires_in?: number;
  },
  fallbackRefreshToken?: string,
): OAuthCredential {
  const now = Date.now();
  const expiresIn = data.expires_in ?? 0;
  const refreshExpiresIn = data.refresh_token_expires_in;

  const metadata: Record<string, unknown> = {};
  if (refreshExpiresIn != null && refreshExpiresIn > 0) {
    metadata.refreshExpiresAt = new Date(
      now + refreshExpiresIn * 1_000,
    ).toISOString();
  }

  return {
    type: "oauth",
    accessToken: data.access_token!,
    refreshToken: data.refresh_token ?? fallbackRefreshToken,
    expiresAt:
      expiresIn > 0
        ? new Date(now + expiresIn * 1_000).toISOString()
        : undefined,
    ...(Object.keys(metadata).length > 0 ? { metadata } : {}),
  };
}

import { sleep } from "@comma-agents/utils";
