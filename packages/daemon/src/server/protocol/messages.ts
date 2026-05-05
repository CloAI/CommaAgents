// Protocol message unions — discriminated unions + parse helpers for both
// client -> daemon and daemon -> client messages.

import { z } from "zod";

import { ListProvidersMessage } from "./requests/list-providers/list-providers.schema";
import { ListSessionsMessage } from "./requests/list-sessions/list-sessions.schema";
import { ListStrategiesMessage } from "./requests/list-strategies/list-strategies.schema";
import { LoadSessionMessage } from "./requests/load-session/load-session.schema";
import { DeleteSessionMessage } from "./requests/delete-session/delete-session.schema";
import { RenameSessionMessage } from "./requests/rename-session/rename-session.schema";
import { PingMessage } from "./requests/ping/ping.schema";
import { StartStrategyMessage } from "./requests/start-strategy/start-strategy.schema";
import { StopStrategyMessage } from "./requests/stop-strategy/stop-strategy.schema";
import { SubscribeMessage } from "./requests/subscribe/subscribe.schema";
import { UnsubscribeMessage } from "./requests/unsubscribe/unsubscribe.schema";
import { UserInputMessage } from "./requests/user-input/user-input.schema";
import { PermissionDecisionMessage } from "./requests/permission-decision/permission-decision.schema";
import { UpdatePolicyMessage } from "./requests/update-policy/update-policy.schema";

import {
  AgentOutputMessage,
  AgentStreamingMessage,
  ErrorMessage,
  ProviderListMessage,
  SessionDeletedMessage,
  SessionListMessage,
  SessionLoadedMessage,
  SessionRenamedMessage,
  StrategyCompletedMessage,
  StrategyErrorMessage,
  StrategyListMessage,
  StrategyStartedMessage,
  PongMessage,
  RequestInputMessage,
  RequestPermissionMessage,
  PolicyUpdatedMessage,
  StepCompletedMessage,
  StepStartedMessage,
} from "./responses";

// Client -> Daemon discriminated union

export const ClientMessage = z.discriminatedUnion("type", [
  StartStrategyMessage,
  StopStrategyMessage,
  UserInputMessage,
  PermissionDecisionMessage,
  UpdatePolicyMessage,
  ListStrategiesMessage,
  ListProvidersMessage,
  ListSessionsMessage,
  LoadSessionMessage,
  DeleteSessionMessage,
  RenameSessionMessage,
  SubscribeMessage,
  UnsubscribeMessage,
  PingMessage,
]);

export type ClientMessage = z.infer<typeof ClientMessage>;

// Daemon -> Client discriminated union

export const DaemonMessage = z.discriminatedUnion("type", [
  StrategyStartedMessage,
  StrategyCompletedMessage,
  StrategyErrorMessage,
  AgentOutputMessage,
  AgentStreamingMessage,
  StepStartedMessage,
  StepCompletedMessage,
  RequestInputMessage,
  RequestPermissionMessage,
  PolicyUpdatedMessage,
  StrategyListMessage,
  ProviderListMessage,
  SessionListMessage,
  SessionLoadedMessage,
  SessionDeletedMessage,
  SessionRenamedMessage,
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
