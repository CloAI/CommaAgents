// Daemon → Client: request_question
// Sent when a tool execution (such as ask_question) requires human feedback.

import { z } from "zod";
import { DaemonBase } from "../../shared";

export const RequestQuestionMessage = DaemonBase.extend({
  type: z.literal("request_question"),
  /** The run ID that needs input. */
  runId: z.string(),
  /** Unique ID for this question request. Echoed in the client's question_response. */
  requestId: z.string(),
  /** Name of the agent that triggered the operation. */
  agentName: z.string(),
  /** Name of the tool that triggered the operation (should be ask_question). */
  toolName: z.string(),
  /** The question asked. */
  question: z.string(),
});

export type RequestQuestionMessage = z.infer<typeof RequestQuestionMessage>;
