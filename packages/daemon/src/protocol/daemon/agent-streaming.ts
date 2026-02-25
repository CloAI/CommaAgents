// Daemon → Client: agent_streaming
// Sent for each streaming event from an agent (mirrors core AgentStreamEvent).

import { z } from "zod";
import { AgentStreamEventSchema, DaemonBase } from "../shared";

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
