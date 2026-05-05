// Daemon → Client: session_loaded
// Response to a load_session request — full transcript + run summaries.

import { z } from "zod";
import { DaemonBase } from "../../shared";
import { SessionMetadataSchema } from "../session-list/session-list.schema";

/** A single completed agent call within a session transcript. */
export const SessionTurnSchema = z.object({
  runId: z.string(),
  strategyName: z.string(),
  agentName: z.string(),
  startedAt: z.string(),
  completedAt: z.string(),
  text: z.string(),
  usage: z.object({
    promptTokens: z.number(),
    completionTokens: z.number(),
  }),
  finishReason: z.string(),
  userMessage: z.string(),
  /** Provider-native message array; opaque to the daemon. */
  responseMessages: z.array(z.unknown()),
});
export type SessionTurnWire = z.infer<typeof SessionTurnSchema>;

export const SessionRunSummarySchema = z.object({
  runId: z.string(),
  strategyName: z.string(),
  strategyPath: z.string(),
  startedAt: z.string(),
  completedAt: z.string().nullable(),
  status: z.enum(["pending", "running", "completed", "error", "cancelled"]),
  error: z
    .object({
      code: z.string(),
      message: z.string(),
    })
    .optional(),
});
export type SessionRunSummaryWire = z.infer<typeof SessionRunSummarySchema>;

export const SessionLoadedMessage = DaemonBase.extend({
  type: z.literal("session_loaded"),
  metadata: SessionMetadataSchema,
  turns: z.array(SessionTurnSchema),
  runs: z.array(SessionRunSummarySchema),
});

export type SessionLoadedMessage = z.infer<typeof SessionLoadedMessage>;
