import { z } from "zod";
import type { ProviderVerificationRequest } from "./verification.types";

const modelsResponseSchema = z.object({
  data: z.array(z.object({ id: z.string().min(1) })),
  has_more: z.boolean(),
});

/**
 * Check one authenticated Anthropic model-list page; pagination is unnecessary for auth.
 * @param {string} apiKey - Effective API credential.
 * @returns {ProviderVerificationRequest} Fixed request and payload validator.
 * @internal
 */
export function createAnthropicVerificationRequest(
  apiKey: string,
): ProviderVerificationRequest {
  return {
    url: "https://api.anthropic.com/v1/models?limit=1",
    headers: { "x-api-key": apiKey, "anthropic-version": "2023-06-01" },
    acceptsResponse: (response) =>
      modelsResponseSchema.safeParse(response).success,
    invalidCredentialStatuses: [401],
  };
}
