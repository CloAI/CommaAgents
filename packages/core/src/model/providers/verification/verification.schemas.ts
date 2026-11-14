import { z } from "zod/v4";

/** Result of one explicit non-generation check, without upstream bodies or secrets. */
export const ProviderVerificationSchema = z.object({
  providerId: z.string(),
  status: z.enum([
    "verified",
    "unsupported",
    "unconfigured",
    "invalid_credentials",
    "access_denied",
    "rate_limited",
    "unavailable",
    "timeout",
    "invalid_response",
  ]),
  checkedAt: z.string(),
});

/** Verification requires the canonical provider identity, without normalization. */
export const VerifyProviderArgumentsSchema = z
  .object({
    providerId: z
      .string()
      .min(1)
      .refine((id) => id.trim() === id),
  })
  .strict();
