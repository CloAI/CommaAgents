import { z } from "zod";
import type { ProviderVerificationRequest } from "./verification.types";

const modelsResponseSchema = z.object({
  object: z.literal("list"),
  data: z.array(z.object({ id: z.string().min(1) })),
});

/**
 * Build OpenAI's authenticated model-list check without creating an SDK model.
 * @param {string} apiKey - Effective API credential.
 * @returns {ProviderVerificationRequest} Fixed request and payload validator.
 * @internal
 */
export function createOpenAIVerificationRequest(
  apiKey: string,
): ProviderVerificationRequest {
  return {
    url: "https://api.openai.com/v1/models",
    headers: { Authorization: `Bearer ${apiKey}` },
    acceptsResponse: (response) =>
      modelsResponseSchema.safeParse(response).success,
    invalidCredentialStatuses: [401],
  };
}
