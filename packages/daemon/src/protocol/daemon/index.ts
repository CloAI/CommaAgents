// Daemon → Client message types — barrel + discriminated union.

import { z } from "zod";

export { AgentOutputMessage } from "./agent-output";
export { AgentStreamingMessage } from "./agent-streaming";
export { ErrorMessage } from "./error";
export { FlowCompletedMessage } from "./flow-completed";
export { FlowErrorMessage } from "./flow-error";
export { FlowListMessage } from "./flow-list";
export { FlowStartedMessage } from "./flow-started";
export { PongMessage } from "./pong";
export { RequestAuthMessage } from "./request-auth";
export { RequestInputMessage } from "./request-input";
export { StepCompletedMessage } from "./step-completed";
export { StepStartedMessage } from "./step-started";

import { AgentOutputMessage } from "./agent-output";
import { AgentStreamingMessage } from "./agent-streaming";
import { ErrorMessage } from "./error";
import { FlowCompletedMessage } from "./flow-completed";
import { FlowErrorMessage } from "./flow-error";
import { FlowListMessage } from "./flow-list";
import { FlowStartedMessage } from "./flow-started";
import { PongMessage } from "./pong";
import { RequestAuthMessage } from "./request-auth";
import { RequestInputMessage } from "./request-input";
import { StepCompletedMessage } from "./step-completed";
import { StepStartedMessage } from "./step-started";

// Discriminated union of all daemon → client messages

export const DaemonMessage = z.discriminatedUnion("type", [
  FlowStartedMessage,
  FlowCompletedMessage,
  FlowErrorMessage,
  AgentOutputMessage,
  AgentStreamingMessage,
  StepStartedMessage,
  StepCompletedMessage,
  RequestInputMessage,
  RequestAuthMessage,
  FlowListMessage,
  PongMessage,
  ErrorMessage,
]);

export type DaemonMessage = z.infer<typeof DaemonMessage>;

// Parse helper — validates raw JSON from the WebSocket

/**
 * Safely parse an unknown value as a DaemonMessage.
 * Returns a Zod SafeParseResult.
 */
export function parseDaemonMessage(raw: unknown) {
  return DaemonMessage.safeParse(raw);
}
