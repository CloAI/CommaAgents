// Protocol message unions — discriminated unions + parse helpers for both
// client -> daemon and daemon -> client messages.

import { z } from "zod";

import { ListFlowsMessage } from "./requests/list-flows/list-flows.schema";
import { PingMessage } from "./requests/ping/ping.schema";
import { StartFlowMessage } from "./requests/start-flow/start-flow.schema";
import { StopFlowMessage } from "./requests/stop-flow/stop-flow.schema";
import { SubscribeMessage } from "./requests/subscribe/subscribe.schema";
import { UnsubscribeMessage } from "./requests/unsubscribe/unsubscribe.schema";
import { UserInputMessage } from "./requests/user-input/user-input.schema";

import {
  AgentOutputMessage,
  AgentStreamingMessage,
  ErrorMessage,
  FlowCompletedMessage,
  FlowErrorMessage,
  FlowListMessage,
  FlowStartedMessage,
  PongMessage,
  RequestInputMessage,
  StepCompletedMessage,
  StepStartedMessage,
} from "./responses";

// Client -> Daemon discriminated union

export const ClientMessage = z.discriminatedUnion("type", [
  StartFlowMessage,
  StopFlowMessage,
  UserInputMessage,
  ListFlowsMessage,
  SubscribeMessage,
  UnsubscribeMessage,
  PingMessage,
]);

export type ClientMessage = z.infer<typeof ClientMessage>;

// Daemon -> Client discriminated union

export const DaemonMessage = z.discriminatedUnion("type", [
  FlowStartedMessage,
  FlowCompletedMessage,
  FlowErrorMessage,
  AgentOutputMessage,
  AgentStreamingMessage,
  StepStartedMessage,
  StepCompletedMessage,
  RequestInputMessage,
  FlowListMessage,
  PongMessage,
  ErrorMessage,
]);

export type DaemonMessage = z.infer<typeof DaemonMessage>;

// Parse helpers — validate raw JSON from the WebSocket

/**
 * Safely parse an unknown value as a ClientMessage.
 * Returns a Zod SafeParseResult.
 */
export function parseClientMessage(raw: unknown) {
  return ClientMessage.safeParse(raw);
}

/**
 * Safely parse an unknown value as a DaemonMessage.
 * Returns a Zod SafeParseResult.
 */
export function parseDaemonMessage(raw: unknown) {
  return DaemonMessage.safeParse(raw);
}
