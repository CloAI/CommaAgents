// Credential Zod schemas and inferred types.
//
// All runtime validation schemas for credential types live here.
// Storage backends and protocol layers import from this file
// rather than owning credential definitions.

import { z } from "zod";

/** API key credential — simple secret string. */
export const ApiCredentialSchema = z.object({
  type: z.literal("api"),
  key: z.string().min(1),
});

/** OAuth 2.0 credential — access + refresh tokens with expiry. */
export const OAuthCredentialSchema = z.object({
  type: z.literal("oauth"),
  accessToken: z.string().min(1),
  refreshToken: z.string().optional(),
  /** ISO-8601 datetime when the access token expires. */
  expiresAt: z.string().datetime().optional(),
  /** Provider account identifier (e.g. GitHub username). */
  accountId: z.string().optional(),
  /** Arbitrary provider-specific metadata. */
  metadata: z.record(z.unknown()).optional(),
});

/** Custom/opaque credential — arbitrary key-value data. */
export const CustomCredentialSchema = z.object({
  type: z.literal("custom"),
  data: z.record(z.unknown()),
});

/**
 * Discriminated union of all credential types.
 * - `api`    — simple API key
 * - `oauth`  — OAuth 2.0 access/refresh tokens
 * - `custom` — arbitrary opaque data
 */
export const CredentialSchema = z.discriminatedUnion("type", [
  ApiCredentialSchema,
  OAuthCredentialSchema,
  CustomCredentialSchema,
]);

export type ApiCredential = z.infer<typeof ApiCredentialSchema>;
export type OAuthCredential = z.infer<typeof OAuthCredentialSchema>;
export type CustomCredential = z.infer<typeof CustomCredentialSchema>;
export type Credential = z.infer<typeof CredentialSchema>;
