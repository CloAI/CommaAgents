// Client → Daemon: question_response
// Sent by the client in response to a request_question event.

import { z } from "zod";
import { ClientBase } from "../../shared";

export const QuestionResponseMessage = ClientBase.extend({
  type: z.literal("question_response"),
  /** The run ID this response is for. */
  runId: z.string().min(1),
  /** The requestId from the matching request_question message. */
  questionRequestId: z.string().min(1),
  /** The user's response text. */
  response: z.string(),
});

export type QuestionResponseMessage = z.infer<typeof QuestionResponseMessage>;
