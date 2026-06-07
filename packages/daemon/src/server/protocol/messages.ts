import { z } from "zod";
import { ContinueRunMessage } from "./requests/continue-run/continue-run.schema";
import { GetAvailableModelsMessage } from "./requests/get-available-models/get-available-models.schema";
import { GetRunMessage } from "./requests/get-run/index";
import { ListProvidersMessage } from "./requests/list-providers/list-providers.schema";
import { ListRunsMessage } from "./requests/list-runs/list-runs.schema";
import { ListStrategiesMessage } from "./requests/list-strategies/list-strategies.schema";
import { PermissionDecisionMessage } from "./requests/permission-decision/permission-decision.schema";
import { PingMessage } from "./requests/ping/ping.schema";
import { QuestionResponseMessage } from "./requests/question-response/question-response.schema";
import { RegisterProviderMessage } from "./requests/register-provider/register-provider.schema";
import { SetCredentialMessage } from "./requests/set-credential/set-credential.schema";
import { StartStrategyMessage } from "./requests/start-strategy/start-strategy.schema";
import { SteerRunMessage } from "./requests/steer-run/steer-run.schema";
import { StopStrategyMessage } from "./requests/stop-strategy/stop-strategy.schema";
import { SubscribeMessage } from "./requests/subscribe/subscribe.schema";
import { TrashClearMessage } from "./requests/trash-clear/trash-clear.schema";
import { TrashListMessage } from "./requests/trash-list/trash-list.schema";
import { TrashRestoreMessage } from "./requests/trash-restore/trash-restore.schema";
import { UnregisterProviderMessage } from "./requests/unregister-provider/unregister-provider.schema";
import { UnsubscribeMessage } from "./requests/unsubscribe/unsubscribe.schema";
import { UpdatePolicyMessage } from "./requests/update-policy/update-policy.schema";
import { UserInputMessage } from "./requests/user-input/user-input.schema";

import {
  AgentOutputMessage,
  AgentStreamingMessage,
  AvailableModelsMessage,
  CredentialSetMessage,
  ErrorMessage,
  PolicyUpdatedMessage,
  PongMessage,
  ProviderListMessage,
  ProviderRegisteredMessage,
  ProviderUnregisteredMessage,
  RequestInputMessage,
  RequestPermissionMessage,
  RequestQuestionMessage,
  RunListMessage,
  RunLoadedMessage,
  SteerQueuedMessage,
  StepCompletedMessage,
  StepStartedMessage,
  StrategyCompletedMessage,
  StrategyErrorMessage,
  StrategyListMessage,
  StrategyStartedMessage,
  TrashClearResultMessage,
  TrashListResultMessage,
  TrashRestoreResultMessage,
} from "./responses";

export const ClientMessage = z.discriminatedUnion("type", [
  StartStrategyMessage,
  ContinueRunMessage,
  StopStrategyMessage,
  UserInputMessage,
  PermissionDecisionMessage,
  QuestionResponseMessage,
  UpdatePolicyMessage,
  SteerRunMessage,
  ListStrategiesMessage,
  GetAvailableModelsMessage,
  ListProvidersMessage,
  RegisterProviderMessage,
  UnregisterProviderMessage,
  SetCredentialMessage,
  ListRunsMessage,
  GetRunMessage,
  SubscribeMessage,
  UnsubscribeMessage,
  TrashListMessage,
  TrashRestoreMessage,
  TrashClearMessage,
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
  SteerQueuedMessage,
  RequestInputMessage,
  RequestPermissionMessage,
  RequestQuestionMessage,
  PolicyUpdatedMessage,
  StrategyListMessage,
  AvailableModelsMessage,
  ProviderListMessage,
  ProviderRegisteredMessage,
  ProviderUnregisteredMessage,
  CredentialSetMessage,
  RunListMessage,
  RunLoadedMessage,
  TrashListResultMessage,
  TrashRestoreResultMessage,
  TrashClearResultMessage,
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
