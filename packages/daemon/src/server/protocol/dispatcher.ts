import type { StrategyExecutor } from "../../executor/executor";
import type { Logger } from "../../logger/logger.types";
import type { RunStore } from "../../runs";
import type { DaemonState } from "../../state/state.types";
import type { HandlerContext, MessageDispatcher } from "./dispatcher.types";
import type { DaemonMessage } from "./messages";
import { parseClientMessage } from "./messages";
import { handleGetAvailableModels } from "./requests/get-available-models";
import { handleListProviders } from "./requests/list-providers";
import { handleListRuns } from "./requests/list-runs";
import { handleListStrategies } from "./requests/list-strategies";
import { handleGetRun } from "./requests/get-run";
import { handlePermissionDecision } from "./requests/permission-decision";
import { handlePing } from "./requests/ping";
import { handleRegisterProvider } from "./requests/register-provider";
import { handleResumeRun } from "./requests/resume-run";
import { handleSetCredential } from "./requests/set-credential";
import { handleStartStrategy } from "./requests/start-strategy";
import { handleStopStrategy } from "./requests/stop-strategy";
import { handleSubscribe } from "./requests/subscribe";
import { handleTrashClear } from "./requests/trash-clear";
import { handleTrashList } from "./requests/trash-list";
import { handleTrashRestore } from "./requests/trash-restore";
import { handleUnregisterProvider } from "./requests/unregister-provider";
import { handleUnsubscribe } from "./requests/unsubscribe";
import { handleUpdatePolicy } from "./requests/update-policy";
import { handleUserInput } from "./requests/user-input";

/** Dependencies needed to construct a dispatcher (everything except per-request state). */
export interface CreateDispatcherOptions {
  /** The strategy executor for starting/stopping runs and routing input/auth. */
  readonly executor: StrategyExecutor;
  /** Centralized daemon state for run/client/subscription tracking. */
  readonly state: DaemonState;
  /** Persistent run store. */
  readonly runStore: RunStore;
  /** Logger for dispatcher-level diagnostics. */
  readonly logger: Logger;
}

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
 * Create a message dispatcher.
 *
 * The dispatcher is the single entry point for all incoming WebSocket
 * messages. It handles:
 *   1. JSON parsing
 *   2. Zod schema validation
 *   3. Routing to the correct handler by message type
 *   4. Top-level error catching
 *
 * @param options - Dependencies needed to construct a dispatcher.
 *
 * @example
 * ```ts
 * const dispatch = createDispatcher({ executor, state, logger });
 * // In the WebSocket message handler:
 * dispatch(clientId, raw, (msg) => ws.send(JSON.stringify(msg)));
 * ```
 */
export function createDispatcher(
  options: CreateDispatcherOptions,
): MessageDispatcher {
  const { executor, state, runStore, logger } = options;

  return function dispatch(
    clientId: string,
    raw: string | Buffer,
    reply: (message: DaemonMessage) => void,
  ): void {
    // 1. Parse JSON
    let json: unknown;
    try {
      const text = typeof raw === "string" ? raw : raw.toString("utf-8");
      json = JSON.parse(text);
    } catch {
      reply(buildErrorMessage("PARSE_ERROR", "Invalid JSON"));
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
      reply(
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
      executor,
      state,
      runStore,
      logger,
      reply,
    };

    // 3. Route to handler
    try {
      switch (message.type) {
        case "ping":
          handlePing(message, context);
          break;
        case "start_strategy":
          handleStartStrategy(message, context);
          break;
        case "stop_strategy":
          handleStopStrategy(message, context);
          break;
        case "user_input":
          handleUserInput(message, context);
          break;
        case "permission_decision":
          handlePermissionDecision(message, context);
          break;
        case "update_policy":
          handleUpdatePolicy(message, context);
          break;
        case "list_strategies":
          handleListStrategies(message, context);
          break;
        case "get_available_models":
          void handleGetAvailableModels(message, context);
          break;
        case "list_providers":
          void handleListProviders(message, context);
          break;
        case "register_provider":
          void handleRegisterProvider(message, context);
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
          void handleListRuns(message, context);
          break;
        case "get_run":
          void handleGetRun(message, context);
          break;
        case "resume_run":
          handleResumeRun(message, context);
          break;
        case "trash_list":
          void handleTrashList(message, context);
          break;
        case "trash_restore":
          void handleTrashRestore(message, context);
          break;
        case "trash_clear":
          void handleTrashClear(message, context);
          break;
        case "set_credential":
          void handleSetCredential(message, context);
          break;
      }
    } catch (caughtError) {
      logger.error(`Message handler error: ${caughtError}`);
      reply(
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
