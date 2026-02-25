// Daemon → Client: agent_output
// Sent when an agent produces final output (non-streaming).

import { z } from "zod";
import { DaemonBase, UsageSchema } from "../shared";

export const AgentOutputMessage = DaemonBase.extend({
  type: z.literal("agent_output"),
  /** The run ID this output belongs to. */
  runId: z.string(),
  /** Name of the agent that produced the output. */
  agentName: z.string(),
  /** The agent's final text response. */
  text: z.string(),
  /** Token usage for this agent call. */
  usage: UsageSchema,
});

export type AgentOutputMessage = z.infer<typeof AgentOutputMessage>;
