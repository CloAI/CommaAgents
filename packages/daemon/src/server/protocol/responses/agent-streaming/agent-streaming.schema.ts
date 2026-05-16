// Daemon → Client: agent_streaming
// Sent for each streaming event from an agent (mirrors core AgentStreamEvent).

import { z } from "zod";
import { DaemonBase } from "../../shared";
import { AgentCallResultSchema } from "../shared";

// AgentStreamEvent — mirrors core AgentStreamEvent discriminated union

export const AgentStreamEventSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("text"), text: z.string() }),
  z.object({
    type: z.literal("tool-call"),
    /**
     * AI-SDK-supplied correlation id. Pairs this call with its eventual
     * `tool-result` event so consumers can render a single row per call
     * even when calls run concurrently or interleave with text/thinking.
     */
    toolCallId: z.string(),
    toolName: z.string(),
    args: z.string(),
  }),
  z.object({
    type: z.literal("tool-result"),
    /** Correlates with the `tool-call` event that started this invocation. */
    toolCallId: z.string(),
    toolName: z.string(),
    /**
     * Raw tool output. For `status: "error"` results this is an empty
     * string by default — the human-readable failure message lives on
     * `error`.
     */
    output: z.string(),
    /** Outcome of the tool invocation. */
    status: z.enum(["completed", "error"]),
    /** Failure message when `status === "error"`. */
    error: z.string().optional(),
  }),
  z.object({ type: z.literal("thinking-start"), id: z.string() }),
  z.object({ type: z.literal("thinking"), id: z.string(), text: z.string() }),
  z.object({ type: z.literal("thinking-end"), id: z.string() }),
  z.object({ type: z.literal("step-start") }),
  z.object({
    type: z.literal("done"),
    result: AgentCallResultSchema,
  }),
]);
export type AgentStreamEventWire = z.infer<typeof AgentStreamEventSchema>;

export const AgentStreamingMessage = DaemonBase.extend({
  type: z.literal("agent_streaming"),
  /** The run ID this stream event belongs to. */
  runId: z.string(),
  /** Name of the agent that is streaming. */
  agentName: z.string(),
  /** The stream event, mirroring core AgentStreamEvent. */
  event: AgentStreamEventSchema,
});

export type AgentStreamingMessage = z.infer<typeof AgentStreamingMessage>;
