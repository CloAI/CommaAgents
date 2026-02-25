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
 * @see https://docs.github.com/en/apps/creating-github-apps/authenticating-with-a-github-app/generating-a-user-access-token-for-a-github-app#using-the-device-flow-to-generate-a-user-access-token
 */

import type { OAuthInfo } from "./store";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Result from GitHub's device code endpoint. */
export interface DeviceCodeResponse {
  /** The URL the user should visit to authorize. */
  verificationUri: string;
  /** The code the user enters at the verification URL. */
  userCode: string;
  /** Internal device code used for polling (not shown to user). */
  deviceCode: string;
  /** Polling interval in seconds suggested by GitHub. */
  interval: number;
  /** Seconds until the device code expires. */
  expiresIn: number;
}

export type PollResult =
  | { type: "success"; auth: OAuthInfo }
  | { type: "expired" }
  | { type: "denied" }
  | { type: "error"; message: string };

// ---------------------------------------------------------------------------
// Device Flow — Step 1: Request device code
// ---------------------------------------------------------------------------

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
    throw new Error(`Failed to initiate device authorization (HTTP ${response.status}): ${body}`);
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

// ---------------------------------------------------------------------------
// Device Flow — Step 2: Poll for access token
// ---------------------------------------------------------------------------

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
      const now = Date.now();
      const expiresIn = data.expires_in ?? 0;
      const refreshExpiresIn = data.refresh_token_expires_in;

      const auth: OAuthInfo = {
        type: "oauth",
        access: data.access_token,
        refresh: data.refresh_token ?? data.access_token,
        expires: expiresIn > 0 ? now + expiresIn * 1_000 : 0,
        ...(refreshExpiresIn != null && refreshExpiresIn > 0
          ? { refreshExpiresAt: now + refreshExpiresIn * 1_000 }
          : {}),
      };

      return { type: "success", auth };
    }

    // Standard device flow error codes
    if (data.error === "authorization_pending") {
      // User hasn't authorized yet — keep polling at the same rate
      continue;
    }

    if (data.error === "slow_down") {
      // RFC 8628 §3.5: add 5 seconds to the interval
      interval += 5;
      // GitHub may also return a new interval value — prefer that if provided
      if (data.interval && typeof data.interval === "number" && data.interval > 0) {
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

// ---------------------------------------------------------------------------
// Token Refresh
// ---------------------------------------------------------------------------

/**
 * Check whether a stored OAuth credential's access token has expired
 * (or will expire within the safety buffer).
 */
export function isExpired(info: OAuthInfo): boolean {
  // expires === 0 means the token never expires
  if (info.expires === 0) return false;
  return Date.now() >= info.expires - EXPIRY_BUFFER_MS;
}

/**
 * Check whether the refresh token itself has expired.
 * If `refreshExpiresAt` is not set, assume it never expires.
 */
export function isRefreshExpired(info: OAuthInfo): boolean {
  if (info.refreshExpiresAt == null || info.refreshExpiresAt === 0) return false;
  return Date.now() >= info.refreshExpiresAt;
}

/**
 * Refresh an expired access token using the stored refresh token.
 *
 * For GitHub App tokens obtained via the device flow, the refresh endpoint
 * does NOT require a client_secret — only the client_id and refresh_token.
 *
 * Returns a new OAuthInfo with updated tokens and expiry timestamps,
 * or `undefined` if the refresh fails (e.g. refresh token itself expired).
 */
export async function refreshAccessToken(info: OAuthInfo): Promise<OAuthInfo | undefined> {
  if (isRefreshExpired(info)) {
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
      refresh_token: info.refresh,
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

  const now = Date.now();
  const expiresIn = data.expires_in ?? 0;
  const refreshExpiresIn = data.refresh_token_expires_in;

  return {
    type: "oauth",
    access: data.access_token,
    refresh: data.refresh_token ?? info.refresh,
    expires: expiresIn > 0 ? now + expiresIn * 1_000 : 0,
    ...(refreshExpiresIn != null && refreshExpiresIn > 0
      ? { refreshExpiresAt: now + refreshExpiresIn * 1_000 }
      : {}),
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
