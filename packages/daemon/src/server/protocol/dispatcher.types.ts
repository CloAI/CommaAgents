import type { HubManager } from "@comma-agents/core/hub";
import type { Logger } from "../../logger/logger.types";
import type { RunSystem } from "../../run-system";
import type { DaemonState } from "../../state/state.types";
import type { DaemonMessage } from "./messages";
import type { AvailableModelsMessage } from "./responses/available-models";
import type { CredentialSetMessage } from "./responses/credential-set";
import type { ErrorMessage } from "./responses/error";
import type { HubPackagesMessage } from "./responses/hub-packages/hub-packages.schema";
import type { McpServerListMessage } from "./responses/mcp-server-list/mcp-server-list.schema";
import type { PongMessage } from "./responses/pong";
import type { ProviderListMessage } from "./responses/provider-list";
import type { ProviderRegisteredMessage } from "./responses/provider-registered";
import type { ProviderUnregisteredMessage } from "./responses/provider-unregistered";
import type { RunListMessage } from "./responses/run-list";
import type { RunPreparedMessage } from "./responses/run-prepared";
import type { StrategyListMessage } from "./responses/strategy-list";
import type { TrashClearResultMessage } from "./responses/trash-clear-result";
import type { TrashListResultMessage } from "./responses/trash-list-result";
import type { TrashRestoreResultMessage } from "./responses/trash-restore-result";

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
  readonly get_available_models: AvailableModelsMessage;
  readonly list_providers: ProviderListMessage;
  readonly register_provider: ProviderRegisteredMessage;
  readonly unregister_provider: ProviderUnregisteredMessage;
  readonly subscribe: never;
  readonly unsubscribe: never;
  readonly list_runs: RunListMessage;
  readonly trash_list: TrashListResultMessage;
  readonly trash_restore: TrashRestoreResultMessage;
  readonly trash_clear: TrashClearResultMessage;
  readonly set_credential: CredentialSetMessage;
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
  readonly runSystem: RunSystem;
  /** Centralized daemon state for run/client/subscription tracking. */
  readonly state: DaemonState;
  /** Logger for handler-level diagnostics. */
  readonly logger: Logger;
  /** Daemon-owned Hub package service. */
  readonly hubManager?: HubManager;
  /** Send a response to the requesting client. Constrained by `RequestResponseMap`. */
  reply(message: RequestResponseMap[RequestType] | ErrorMessage): void;
}

/**
 * A dispatcher function produced by `createDispatcher()`.
 *
 * The server calls this for every incoming WebSocket message.
 * It handles JSON parsing, Zod validation, and routing to the
 * correct handler — the server never touches message content.
 */
export type MessageDispatcher = (
  clientId: string,
  raw: string | Buffer,
  reply: (message: DaemonMessage) => void,
) => void;
