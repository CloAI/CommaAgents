import { z } from "zod";
import type { ProviderVerificationRequest } from "./verification.types";

const modelsResponseSchema = z
  .object({
    // ProtoJSON omits repeated fields when the list is empty.
    models: z
      .array(z.object({ name: z.string().regex(/^models\/.+/) }))
      .optional(),
    nextPageToken: z.string().optional(),
  })
  .strict();

/**
 * Keep the Gemini key in a header rather than the request URL.
 * @param {string} apiKey - Effective API credential.
 * @returns {ProviderVerificationRequest} Fixed request and payload validator.
 * @internal
 */
export function createGoogleVerificationRequest(
  apiKey: string,
): ProviderVerificationRequest {
  return {
    url: "https://generativelanguage.googleapis.com/v1/models?pageSize=1",
    headers: { "x-goog-api-key": apiKey },
    acceptsResponse: (response) =>
      modelsResponseSchema.safeParse(response).success,
    invalidCredentialStatuses: [400, 401],
  };
}
