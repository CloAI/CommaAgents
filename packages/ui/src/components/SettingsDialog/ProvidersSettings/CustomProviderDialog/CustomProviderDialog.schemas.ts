import { z } from "zod";

export const customProviderSchema = z.object({
  id: z
    .string()
    .trim()
    .regex(
      /^[a-z0-9][a-z0-9_-]*$/,
      "Use lowercase letters, digits, hyphens, and underscores for the provider ID.",
    ),
  name: z.string().trim().min(1, "Enter a display name."),
  baseURL: z
    .string()
    .trim()
    .refine((value) => {
      try {
        const url = new URL(value);
        return (
          ["http:", "https:"].includes(url.protocol) &&
          !url.username &&
          !url.password &&
          !url.search &&
          !url.hash
        );
      } catch {
        return false;
      }
    }, "Enter an HTTP(S) API base URL without credentials, query parameters, or a fragment."),
  credentialType: z.enum(["api", "none"]),
  apiKey: z.string().trim(),
  models: z.string(),
});
