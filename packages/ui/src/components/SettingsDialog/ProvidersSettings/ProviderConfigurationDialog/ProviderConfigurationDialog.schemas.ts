import { z } from "zod";

/** Validate a replacement key only when this provider still needs credentials.
 * @param {boolean} requiresKey - Whether the provider has no usable credentials yet.
 * @returns {z.ZodObject} Schema for the new API-key draft.
 * @example
 * const schema = providerConfigurationSchema(true);
 */
export function providerConfigurationSchema(requiresKey: boolean) {
  return z.object({
    apiKey: z
      .string()
      .trim()
      .refine((value) => !requiresKey || value.length > 0, "Enter an API key."),
  });
}
