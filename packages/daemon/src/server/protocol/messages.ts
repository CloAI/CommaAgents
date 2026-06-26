import { z } from "zod";
import { ContinueRunMessage } from "./requests/continue-run/continue-run.schema";
import { GetAvailableModelsMessage } from "./requests/get-available-models/get-available-models.schema";
import {
  HubInstallMessage,
  HubListMessage,
  HubRemoveMessage,
  HubUpdateMessage,
} from "./requests/hub-packages/hub-packages.schema";
import { ListMcpServersMessage } from "./requests/list-mcp-servers/list-mcp-servers.schema";
import { ListProvidersMessage } from "./requests/list-providers/list-providers.schema";
import { ListRunsMessage } from "./requests/list-runs/list-runs.schema";
import { ListStrategiesMessage } from "./requests/list-strategies/list-strategies.schema";
import { PermissionDecisionMessage } from "./requests/permission-decision/permission-decision.schema";
import { PingMessage } from "./requests/ping/ping.schema";
import { PrepareRunMessage } from "./requests/prepare-run/prepare-run.schema";
import { QuestionResponseMessage } from "./requests/question-response/question-response.schema";
import { RegisterProviderMessage } from "./requests/register-provider/register-provider.schema";
import { SetCredentialMessage } from "./requests/set-credential/set-credential.schema";
import { StartRunMessage } from "./requests/start-run/start-run.schema";
import { SteerRunMessage } from "./requests/steer-run/steer-run.schema";
import { StopRunMessage } from "./requests/stop-run/stop-run.schema";
import { SubscribeMessage } from "./requests/subscribe/subscribe.schema";
import { TrashClearMessage } from "./requests/trash-clear/trash-clear.schema";
import { TrashListMessage } from "./requests/trash-list/trash-list.schema";
import { TrashRestoreMessage } from "./requests/trash-restore/trash-restore.schema";
import { UnregisterProviderMessage } from "./requests/unregister-provider/unregister-provider.schema";
import { UnsubscribeMessage } from "./requests/unsubscribe/unsubscribe.schema";
import { UpdateMcpServerMessage } from "./requests/update-mcp-server/update-mcp-server.schema";
import { UpdatePolicyMessage } from "./requests/update-policy/update-policy.schema";
import { UserInputMessage } from "./requests/user-input/user-input.schema";

import {
  AgentOutputMessage,
  AgentStreamingMessage,
  AvailableModelsMessage,
  CredentialSetMessage,
  ErrorMessage,
  HubPackagesMessage,
  McpServerListMessage,
  PolicyUpdatedMessage,
  PongMessage,
  ProviderListMessage,
  ProviderRegisteredMessage,
  ProviderUnregisteredMessage,
  RequestInputMessage,
  RequestPermissionMessage,
  RequestQuestionMessage,
  RunListMessage,
  RunPreparedMessage,
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

export const ClientMessage = z
  .discriminatedUnion("type", [
    PrepareRunMessage,
    StartRunMessage,
    ContinueRunMessage,
    StopRunMessage,
    UserInputMessage,
    PermissionDecisionMessage,
    QuestionResponseMessage,
    UpdatePolicyMessage,
    SteerRunMessage,
    ListStrategiesMessage,
    GetAvailableModelsMessage,
    ListProvidersMessage,
    ListMcpServersMessage,
    UpdateMcpServerMessage,
    RegisterProviderMessage,
    UnregisterProviderMessage,
    SetCredentialMessage,
    ListRunsMessage,
    SubscribeMessage,
    UnsubscribeMessage,
    TrashListMessage,
    TrashRestoreMessage,
    TrashClearMessage,
    PingMessage,
    HubListMessage,
    HubInstallMessage,
    HubUpdateMessage,
    HubRemoveMessage,
  ])
  .superRefine((message, context) => {
    if (
      message.type === "prepare_run" &&
      message.runId === undefined &&
      message.strategyPath === undefined
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "prepare_run requires runId or strategyPath",
        path: ["strategyPath"],
      });
    }
  });

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
  RunPreparedMessage,
  PolicyUpdatedMessage,
  StrategyListMessage,
  AvailableModelsMessage,
  ProviderListMessage,
  ProviderRegisteredMessage,
  ProviderUnregisteredMessage,
  CredentialSetMessage,
  RunListMessage,
  TrashListResultMessage,
  TrashRestoreResultMessage,
  TrashClearResultMessage,
  PongMessage,
  ErrorMessage,
  HubPackagesMessage,
  McpServerListMessage,
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
