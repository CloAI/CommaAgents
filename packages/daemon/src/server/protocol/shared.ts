// Shared protocol primitives — base envelopes only.
//
// ClientBase and DaemonBase are the two fields-objects that every
// request and response schema extends. Everything else has been
// colocated to its natural home:
//   - Credential schemas  → credentials/credentials.schema.ts
//   - UsageSchema, AgentCallResultSchema → responses/shared.ts
//   - ErrorInfoSchema     → responses/strategy-error/strategy-error.schema.ts
//   - RunSummarySchema    → responses/strategy-list/strategy-list.schema.ts
//   - AgentStreamEventSchema → responses/agent-streaming/agent-streaming.schema.ts

import { z } from "zod";

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
