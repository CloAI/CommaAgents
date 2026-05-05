import type { Credential } from "../../../credentials/credentials.types";
import type { ListModelsContext, ListModelsFn, ModelCapabilities, ModelInfo } from "../providers.types";

const COPILOT_DEFAULT_BASE = "https://api.githubcopilot.com";
const COPILOT_FETCH_TIMEOUT_MS = 5_000;
const COPILOT_USER_AGENT = "cloai";

interface CopilotModelsResponse {
  readonly data?: readonly CopilotModelEntry[];
}

interface CopilotModelEntry {
  readonly id: string;
  readonly name?: string;
  readonly version?: string;
  readonly model_picker_enabled?: boolean;
  readonly policy?: { readonly state?: string };
  readonly supported_endpoints?: readonly string[];
  readonly capabilities?: {
    readonly family?: string;
    readonly limits?: {
      readonly max_context_window_tokens?: number;
      readonly max_output_tokens?: number;
      readonly max_prompt_tokens?: number;
    };
    readonly supports?: {
      readonly streaming?: boolean;
      readonly tool_calls?: boolean;
      readonly structured_outputs?: boolean;
      readonly vision?: boolean;
      readonly reasoning_effort?: readonly string[];
      readonly adaptive_thinking?: boolean;
    };
  };
}

/** Extract a Bearer token from a credential, preferring OAuth access tokens. */
function extractBearerToken(credential: Credential | undefined): string | undefined {
  if (!credential) return undefined;
  if (credential.type === "oauth") return credential.accessToken;
  if (credential.type === "api") return credential.key;
  return undefined;
}

/**
 * Resolve the Copilot API base URL. Enterprise users may have an
 * `enterpriseDomain` set in their credential metadata; we fall back to
 * the github.com endpoint otherwise. `context.baseURL` takes precedence.
 */
function resolveCopilotBase(context: ListModelsContext): string {
  if (context.baseURL && context.baseURL.length > 0) {
    return context.baseURL.replace(/\/$/, "");
  }

  if (context.credential?.type === "oauth") {
    const rawDomain = context.credential.metadata?.enterpriseDomain;
    if (typeof rawDomain === "string" && rawDomain.length > 0) {
      const normalized = rawDomain.replace(/^https?:\/\//, "").replace(/\/$/, "");
      return `https://copilot-api.${normalized}`;
    }
  }

  return COPILOT_DEFAULT_BASE;
}

/**
 * List GitHub Copilot models via `GET {base}/models`.
 *
 * Requires an OAuth credential (GitHub access token). Filters out models
 * where `model_picker_enabled` is false or `policy.state === "disabled"`.
 * Populates capabilities/limits from the response and leaves pricing blank
 * (Copilot is subscription-based, not per-token).
 */
export const listCopilotModels: ListModelsFn = async (
  context: ListModelsContext,
): Promise<readonly ModelInfo[]> => {
  const token = extractBearerToken(context.credential);
  if (!token) {
    throw new Error("GitHub Copilot listing requires an OAuth or API credential");
  }

  const base = resolveCopilotBase(context);
  const url = `${base}/models`;
  const signal = context.signal ?? AbortSignal.timeout(COPILOT_FETCH_TIMEOUT_MS);

  const response = await fetch(url, {
    signal,
    headers: {
      Authorization: `Bearer ${token}`,
      "User-Agent": COPILOT_USER_AGENT,
    },
  });

  if (!response.ok) {
    throw new Error(`GitHub Copilot ${response.status} ${response.statusText} at ${url}`);
  }

  const payload = (await response.json()) as CopilotModelsResponse;
  const rawModels = payload.data ?? [];

  const filtered = rawModels.filter(
    (entry) =>
      entry.model_picker_enabled === true && entry.policy?.state !== "disabled",
  );

  return filtered.map((entry): ModelInfo => {
    const supports = entry.capabilities?.supports;
    const limits = entry.capabilities?.limits;

    const capabilities: ModelCapabilities = {
      ...(supports?.tool_calls !== undefined ? { tools: supports.tool_calls } : {}),
      ...(supports?.vision !== undefined ? { vision: supports.vision } : {}),
      ...(supports?.structured_outputs !== undefined
        ? { structuredOutput: supports.structured_outputs }
        : {}),
      ...(supports?.reasoning_effort !== undefined || supports?.adaptive_thinking !== undefined
        ? { reasoning: Boolean(supports?.adaptive_thinking || supports?.reasoning_effort?.length) }
        : {}),
    };

    return {
      id: entry.id,
      ...(entry.name ? { name: entry.name } : {}),
      ...(entry.capabilities?.family ? { family: entry.capabilities.family } : {}),
      ...(limits?.max_context_window_tokens !== undefined
        ? { contextWindow: limits.max_context_window_tokens }
        : {}),
      ...(limits?.max_prompt_tokens !== undefined
        ? { maxInputTokens: limits.max_prompt_tokens }
        : {}),
      ...(limits?.max_output_tokens !== undefined
        ? { maxOutputTokens: limits.max_output_tokens }
        : {}),
      capabilities,
    };
  });
};
