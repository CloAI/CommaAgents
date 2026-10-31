import { z } from "zod";
import { ContinueRunMessage } from "./requests/continue-run/continue-run.schema";
import {
  HubInstallMessage,
  HubListMessage,
  HubRemoveMessage,
  HubUpdateMessage,
} from "./requests/hub-packages/hub-packages.schema";
import { ListMcpServersMessage } from "./requests/list-mcp-servers/list-mcp-servers.schema";
import { ListRunsMessage } from "./requests/list-runs/list-runs.schema";
import { ListStrategiesMessage } from "./requests/list-strategies/list-strategies.schema";
import { PermissionDecisionMessage } from "./requests/permission-decision/permission-decision.schema";
import { PingMessage } from "./requests/ping/ping.schema";
import { PrepareRunMessage } from "./requests/prepare-run/prepare-run.schema";
import { QuestionResponseMessage } from "./requests/question-response/question-response.schema";
import { StartRunMessage } from "./requests/start-run/start-run.schema";
import { SteerRunMessage } from "./requests/steer-run/steer-run.schema";
import { StopRunMessage } from "./requests/stop-run/stop-run.schema";
import { SubscribeMessage } from "../daemon-services/subscription/subscribe/subscribe.schema";
import { TrashClearMessage } from "./requests/trash-clear/trash-clear.schema";
import { TrashListMessage } from "./requests/trash-list/trash-list.schema";
import { TrashRestoreMessage } from "./requests/trash-restore/trash-restore.schema";
import { UnsubscribeMessage } from "../daemon-services/subscription/unsubscribe/unsubscribe.schema";
import { UpdateMcpServerMessage } from "./requests/update-mcp-server/update-mcp-server.schema";
import { UpdatePolicyMessage } from "./requests/update-policy/update-policy.schema";
import { UserInputMessage } from "./requests/user-input/user-input.schema";

import {
  AgentOutputMessage,
  AgentStreamingMessage,
  ErrorMessage,
  HubPackagesMessage,
  McpServerListMessage,
  PolicyUpdatedMessage,
  PongMessage,
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
    ListMcpServersMessage,
    UpdateMcpServerMessage,
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
 * Returns typed data on success or validation details on failure.
 *
 * @param {unknown} raw - Value received from an untrusted client frame.
 * @returns {z.ZodSafeParseResult<ClientMessage>} Parsed message or validation errors.
 */
export function parseClientMessage(raw: unknown) {
  return ClientMessage.safeParse(raw);
}

/**
 * Safely parse an unknown value as a DaemonMessage.
 * Returns typed data on success or validation details on failure.
 *
 * @param {unknown} raw - Value to validate as an outbound daemon message.
 * @returns {z.ZodSafeParseResult<DaemonMessage>} Parsed message or validation errors.
 */
export function parseDaemonMessage(raw: unknown) {
  return DaemonMessage.safeParse(raw);
}
