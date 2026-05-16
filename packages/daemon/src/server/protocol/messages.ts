import { z } from "zod";
import { DeleteSessionMessage } from "./requests/delete-session/delete-session.schema";
import { GetAvailableModelsMessage } from "./requests/get-available-models/get-available-models.schema";
import { ListProvidersMessage } from "./requests/list-providers/list-providers.schema";
import { ListSessionsMessage } from "./requests/list-sessions/list-sessions.schema";
import { ListStrategiesMessage } from "./requests/list-strategies/list-strategies.schema";
import { LoadSessionMessage } from "./requests/load-session/load-session.schema";
import { PermissionDecisionMessage } from "./requests/permission-decision/permission-decision.schema";
import { PingMessage } from "./requests/ping/ping.schema";
import { RenameSessionMessage } from "./requests/rename-session/rename-session.schema";
import { StartStrategyMessage } from "./requests/start-strategy/start-strategy.schema";
import { StopStrategyMessage } from "./requests/stop-strategy/stop-strategy.schema";
import { SubscribeMessage } from "./requests/subscribe/subscribe.schema";
import { UnsubscribeMessage } from "./requests/unsubscribe/unsubscribe.schema";
import { UpdatePolicyMessage } from "./requests/update-policy/update-policy.schema";
import { UserInputMessage } from "./requests/user-input/user-input.schema";

import {
  AgentOutputMessage,
  AgentStreamingMessage,
  AvailableModelsMessage,
  ErrorMessage,
  PolicyUpdatedMessage,
  PongMessage,
  ProviderListMessage,
  RequestInputMessage,
  RequestPermissionMessage,
  SessionDeletedMessage,
  SessionListMessage,
  SessionLoadedMessage,
  SessionRenamedMessage,
  StepCompletedMessage,
  StepStartedMessage,
  StrategyCompletedMessage,
  StrategyErrorMessage,
  StrategyListMessage,
  StrategyStartedMessage,
} from "./responses";

export const ClientMessage = z.discriminatedUnion("type", [
  StartStrategyMessage,
  StopStrategyMessage,
  UserInputMessage,
  PermissionDecisionMessage,
  UpdatePolicyMessage,
  ListStrategiesMessage,
  GetAvailableModelsMessage,
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
  AvailableModelsMessage,
  ProviderListMessage,
  SessionListMessage,
  SessionLoadedMessage,
  SessionDeletedMessage,
  SessionRenamedMessage,
  PongMessage,
  ErrorMessage,
]);

export type DaemonMessage = z.infer<typeof DaemonMessage>;

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
