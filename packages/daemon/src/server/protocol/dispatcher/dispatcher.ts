import type { RunSystem } from "../../../run-system";
import type { DaemonMessage } from "../messages";
import { parseClientMessage } from "../messages";
import { handleContinueRun } from "../requests/continue-run";
import { handleGetAvailableModels } from "../requests/get-available-models";
import {
  handleHubInstall,
  handleHubList,
  handleHubRemove,
  handleHubUpdate,
} from "../requests/hub-packages";
import { handleListMcpServers } from "../requests/list-mcp-servers";
import { handleListProviders } from "../requests/list-providers";
import { handleListRuns } from "../requests/list-runs";
import { handleListStrategies } from "../requests/list-strategies";
import { handlePermissionDecision } from "../requests/permission-decision";
import { handlePing } from "../requests/ping";
import { handlePrepareRun } from "../requests/prepare-run";
import { handleQuestionResponse } from "../requests/question-response";
import { handleRegisterProvider } from "../requests/register-provider";
import { handleSetCredential } from "../requests/set-credential";
import { handleStartRun } from "../requests/start-run";
import { handleSteerRun } from "../requests/steer-run";
import { handleStopRun } from "../requests/stop-run";
import { handleSubscribe } from "../requests/subscribe";
import { handleTrashClear } from "../requests/trash-clear";
import { handleTrashList } from "../requests/trash-list";
import { handleTrashRestore } from "../requests/trash-restore";
import { handleUnregisterProvider } from "../requests/unregister-provider";
import { handleUnsubscribe } from "../requests/unsubscribe";
import { handleUpdateMcpServer } from "../requests/update-mcp-server";
import { handleUpdatePolicy } from "../requests/update-policy";
import { handleUserInput } from "../requests/user-input";
import type {
  CreateDispatcherOptions,
  Dispatcher,
  HandlerContext,
  MessageHandler,
} from "./dispatcher.types";

/** Build a timestamped daemon error message. */
function buildErrorMessage(
  code: string,
  message: string,
  requestId?: string,
): DaemonMessage {
  return {
    type: "error" as const,
    code,
    message,
    ts: new Date().toISOString(),
    ...(requestId !== undefined ? { requestId } : {}),
  };
}

/**
 * Create the daemon's bidirectional protocol dispatcher.
 *
 * Outbound methods deliver direct responses and run broadcasts. After the
 * run system is constructed, `createMessageHandler()` binds inbound parsing,
 * validation, request routing, and error handling to it.
 *
 * @param options - Dependencies needed to construct a dispatcher.
 *
 * @example
 * ```ts
 * const dispatcher = createDispatcher({ state, clients, logger, hubManager });
 * const runSystem = createRunSystem({ daemonState: state, messageSender: dispatcher, ... });
 * const handleMessage = dispatcher.createMessageHandler(runSystem);
 * ```
 */
export function createDispatcher({
  state,
  clients,
  logger,
  hubManager,
}: CreateDispatcherOptions): Dispatcher {
  function send(clientId: string, message: DaemonMessage): void {
    const websocket = clients.get(clientId);
    if (!websocket) {
      logger.debug(`send: client ${clientId} not found`);
      return;
    }

    try {
      websocket.send(JSON.stringify(message));
    } catch {
      logger.debug(`Failed to send to client ${clientId}`);
    }
  }

  function broadcast(runId: string, message: DaemonMessage): void {
    const serializedMessage = JSON.stringify(message);
    for (const clientId of state.getSubscribers(runId)) {
      const websocket = clients.get(clientId);
      if (!websocket) continue;

      try {
        websocket.send(serializedMessage);
      } catch {
        logger.debug(
          `Failed to send to client ${clientId}, likely disconnected`,
        );
      }
    }
  }

  function createMessageHandler(runSystem: RunSystem): MessageHandler {
    return async function handleMessage(
      clientId: string,
      raw: string | Buffer,
    ): Promise<void> {
      // 1. Parse JSON
      let json: unknown;
      try {
        const text = typeof raw === "string" ? raw : raw.toString("utf-8");
        json = JSON.parse(text);
      } catch {
        send(clientId, buildErrorMessage("PARSE_ERROR", "Invalid JSON"));
        return;
      }

      // 2. Validate against protocol schema
      const result = parseClientMessage(json);
      if (!result.success) {
        const details = result.error.errors
          .map(
            (validationError) =>
              `${validationError.path.join(".")}: ${validationError.message}`,
          )
          .join("; ");
        send(
          clientId,
          buildErrorMessage(
            "VALIDATION_ERROR",
            `Invalid message: ${details}`,
            (json as Record<string, unknown>)?.requestId as string | undefined,
          ),
        );
        return;
      }

      const message = result.data;

      // Log the routing decision so verbose runs show every successfully
      // parsed inbound message and which handler it dispatches to.
      logger.debug(
        `route ${message.type}` +
          (message.requestId ? ` (requestId=${message.requestId})` : "") +
          ` from ${clientId}`,
      );

      const context: HandlerContext = {
        clientId,
        runSystem,
        state,
        logger,
        hubManager,
        reply(message) {
          send(clientId, message);
        },
      };

      // 3. Route to handler
      try {
        switch (message.type) {
          case "ping":
            handlePing(message, context);
            break;
          case "prepare_run":
            await handlePrepareRun(message, context);
            break;
          case "start_run":
            handleStartRun(message, context);
            break;
          case "continue_run":
            handleContinueRun(message, context);
            break;
          case "stop_run":
            handleStopRun(message, context);
            break;
          case "user_input":
            handleUserInput(message, context);
            break;
          case "permission_decision":
            handlePermissionDecision(message, context);
            break;
          case "question_response":
            handleQuestionResponse(message, context);
            break;
          case "update_policy":
            handleUpdatePolicy(message, context);
            break;
          case "steer_run":
            handleSteerRun(message, context);
            break;
          case "list_strategies":
            handleListStrategies(message, context);
            break;
          case "get_available_models":
            await handleGetAvailableModels(message, context);
            break;
          case "list_providers":
            await handleListProviders(message, context);
            break;
          case "list_mcp_servers":
            await handleListMcpServers(message, context);
            break;
          case "update_mcp_server":
            await handleUpdateMcpServer(message, context);
            break;
          case "register_provider":
            await handleRegisterProvider(message, context);
            break;
          case "unregister_provider":
            handleUnregisterProvider(message, context);
            break;
          case "subscribe":
            handleSubscribe(message, context);
            break;
          case "unsubscribe":
            handleUnsubscribe(message, context);
            break;
          case "list_runs":
            await handleListRuns(message, context);
            break;
          case "trash_list":
            await handleTrashList(message, context);
            break;
          case "trash_restore":
            await handleTrashRestore(message, context);
            break;
          case "trash_clear":
            await handleTrashClear(message, context);
            break;
          case "set_credential":
            await handleSetCredential(message, context);
            break;
          case "hub_list":
            await handleHubList(message, context);
            break;
          case "hub_install":
            await handleHubInstall(message, context);
            break;
          case "hub_update":
            await handleHubUpdate(message, context);
            break;
          case "hub_remove":
            await handleHubRemove(message, context);
            break;
        }
      } catch (caughtError) {
        logger.error(`Message handler error: ${caughtError}`);
        send(
          clientId,
          buildErrorMessage(
            "INTERNAL_ERROR",
            caughtError instanceof Error
              ? caughtError.message
              : String(caughtError),
            message.requestId,
          ),
        );
      }
    };
  }

  return { send, broadcast, createMessageHandler };
}

export type { CreateDispatcherOptions } from "./dispatcher.types";
