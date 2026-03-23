// Shared protocol primitives — base envelopes, reusable schemas.

import { z } from "zod";

// Base envelopes

/**
 * Fields present on every client → daemon message.
 * `requestId` is optional; when provided, the daemon echoes it back
 * on the response so the client can correlate request/response pairs.
 */
export const ClientBase = z.object({
  requestId: z.string().optional(),
});

/**
 * Fields present on every daemon → client message.
 * - `requestId` — echoed from the triggering client message (if any).
 * - `ts` — ISO-8601 timestamp set by the daemon at send time.
 */
export const DaemonBase = z.object({
  requestId: z.string().optional(),
  ts: z.string().datetime(),
});

// Reusable schemas

/** Token usage summary. Mirrors core AgentCallResult.usage. */
export const UsageSchema = z.object({
  promptTokens: z.number(),
  completionTokens: z.number(),
});
export type Usage = z.infer<typeof UsageSchema>;

/** Structured error info sent in error messages. */
export const ErrorInfoSchema = z.object({
  code: z.string(),
  message: z.string(),
});
export type ErrorInfo = z.infer<typeof ErrorInfoSchema>;

/**
 * Serialized AgentCallResult — the subset we send over the wire.
 * We intentionally omit `steps` (complex AI SDK internals) and send
 * only the fields clients actually need.
 */
export const AgentCallResultSchema = z.object({
  text: z.string(),
  usage: UsageSchema,
  finishReason: z.string(),
});
export type AgentCallResultWire = z.infer<typeof AgentCallResultSchema>;

/** Summary of a running or completed flow, used in flow_list responses. */
export const RunSummarySchema = z.object({
  runId: z.string(),
  strategyName: z.string(),
  status: z.enum(["pending", "running", "completed", "error", "cancelled"]),
  startedAt: z.string().datetime(),
  completedAt: z.string().datetime().optional(),
});
export type RunSummary = z.infer<typeof RunSummarySchema>;

// AgentStreamEvent — mirrors core AgentStreamEvent discriminated union

export const AgentStreamEventSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("text"), text: z.string() }),
  z.object({
    type: z.literal("tool-call"),
    toolName: z.string(),
    args: z.string(),
  }),
  z.object({
    type: z.literal("tool-result"),
    toolName: z.string(),
    output: z.string(),
  }),
  z.object({ type: z.literal("step-start") }),
  z.object({
    type: z.literal("done"),
    result: AgentCallResultSchema,
  }),
]);
export type AgentStreamEventWire = z.infer<typeof AgentStreamEventSchema>;

// Credential — discriminated union for auth credential types

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
 * Discriminated union of all credential types sent over the wire.
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
