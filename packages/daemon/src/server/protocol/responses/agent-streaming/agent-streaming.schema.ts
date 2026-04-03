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
