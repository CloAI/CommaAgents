import type { HubManager } from "@comma-agents/core/hub";
import type { WebSocket } from "uWebSockets.js";
import type { DaemonRunState } from "../../../daemon-run-state";
import type { DaemonStore } from "../../daemon-store";
import type { WsData } from "../../createDaemon.types";
import type { DaemonMessage } from "../messages";
import type { ErrorMessage } from "../responses/error";
import type { HubPackagesMessage } from "../responses/hub-packages/hub-packages.schema";
import type { McpServerListMessage } from "../responses/mcp-server-list/mcp-server-list.schema";
import type { PongMessage } from "../responses/pong";
import type { RunListMessage } from "../responses/run-list";
import type { RunPreparedMessage } from "../responses/run-prepared";
import type { StrategyListMessage } from "../responses/strategy-list";
import type { TrashClearResultMessage } from "../responses/trash-clear-result";
import type { TrashListResultMessage } from "../responses/trash-list-result";
import type { TrashRestoreResultMessage } from "../responses/trash-restore-result";

/**
 * Compile-time map from each client request type literal to the success
 * response type(s) the handler is allowed to send.
 *
 * `never` means the handler only replies with `ErrorMessage` (or not at all).
 * A union (e.g. `FooMessage | BarMessage`) permits multiple success shapes.
 *
 * @example
 * ```ts
 * // Ping may reply with PongMessage (or ErrorMessage, always implicit)
 * type PingResponse = RequestResponseMap["ping"]; // PongMessage
 * // Start-run never sends a direct success response
 * type StartRunResponse = RequestResponseMap["start_run"]; // never
 * ```
 */
export interface RequestResponseMap {
  readonly ping: PongMessage;
  readonly prepare_run: RunPreparedMessage;
  readonly start_run: never;
  readonly continue_run: never;
  readonly stop_run: never;
  readonly user_input: never;
  readonly permission_decision: never;
  readonly question_response: never;
  readonly update_policy: never;
  readonly steer_run: never;
  readonly list_strategies: StrategyListMessage;
  readonly subscribe: never;
  readonly unsubscribe: never;
  readonly list_runs: RunListMessage;
  readonly trash_list: TrashListResultMessage;
  readonly trash_restore: TrashRestoreResultMessage;
  readonly trash_clear: TrashClearResultMessage;
  readonly hub_list: HubPackagesMessage;
  readonly hub_install: HubPackagesMessage;
  readonly hub_update: HubPackagesMessage;
  readonly hub_remove: HubPackagesMessage;
  readonly list_mcp_servers: McpServerListMessage;
  readonly update_mcp_server: McpServerListMessage;
}

/**
 * Context passed to every request handler.
 *
 * Provides the handler with everything it needs to process a request:
 * identity, dependencies, and a `reply()` function whose accepted
 * message type is derived from `RequestResponseMap`.
 *
 * The `RequestType` parameter is a key of `RequestResponseMap`.
 * `reply()` accepts `RequestResponseMap[RequestType] | ErrorMessage`,
 * so each handler is statically constrained to its correct response.
 *
 * @example
 * ```ts
 * // Ping handler — may only reply with PongMessage or ErrorMessage
 * function handlePing(message: PingMessage, context: HandlerContext<"ping">): void {
 *   context.reply({ type: "pong", ts: new Date().toISOString() });
 * }
 *
 * // Start-run handler — may only reply with ErrorMessage (never = error-only)
 * function handleStartRun(message: StartRunMessage, context: HandlerContext<"start_run">): void {
 *   // context.reply({ type: "pong", ... }); // Type error!
 * }
 * ```
 */
export interface HandlerContext<
  RequestType extends keyof RequestResponseMap = keyof RequestResponseMap,
> {
  /** The client ID that sent this request. */
  readonly clientId: string;
  /** Run lifecycle, actions, and persisted run storage. */
  readonly daemonRunState: DaemonRunState;
  /** Centralized daemon state for run/client/subscription tracking. */
  readonly daemonStore: DaemonStore;

  /** Daemon-owned Hub package service. */
  readonly hubManager?: HubManager;
  /** Send a response to the requesting client. Constrained by `RequestResponseMap`. */
  reply(message: RequestResponseMap[RequestType] | ErrorMessage): void;
}

/** Sends daemon messages to one client or every subscriber of a run. */
export interface MessageSender {
  /** Send a message to one connected client. */
  send(clientId: string, message: DaemonMessage): void;

  /** Send a message to every client subscribed to a run. */
  broadcast(runId: string, message: DaemonMessage): void;
}

/** Outbound daemon protocol boundary. */
export interface Dispatcher extends MessageSender {}

/** Dependencies used to create the daemon protocol dispatcher. */
export interface CreateDispatcherOptions {
  /** Centralized daemon state for client subscriptions. */
  readonly daemonStore: DaemonStore;
  /** Connected WebSocket clients keyed by their daemon client ID. */
  readonly clients: Map<string, WebSocket<WsData>>;
}
