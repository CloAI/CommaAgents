// Daemon → Client: agent_output
// Sent when an agent produces final output (non-streaming).

import { z } from "zod";
import { DaemonBase } from "../../shared";
import { UsageSchema } from "../shared";

export const AgentOutputMessage = DaemonBase.extend({
  type: z.literal("agent_output"),
  /** The run ID this output belongs to. */
  runId: z.string(),
  /** Name of the agent that produced the output. */
  agentName: z.string(),
  /** Provider/model identifier used by this agent call. */
  model: z.string().optional(),
  /** Maximum context tokens supported by the model, when known. */
  contextWindow: z.number().optional(),
  /** The agent's final text response. */
  text: z.string(),
  /** Token usage for this agent call. */
  usage: UsageSchema,
  /** Tokens occupying the final model step's context window. */
  contextTokens: z.number().optional(),
});

export type AgentOutputMessage = z.infer<typeof AgentOutputMessage>;
