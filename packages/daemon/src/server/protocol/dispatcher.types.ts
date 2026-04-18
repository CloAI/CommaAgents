// Dispatcher types — shared context, handler signatures, and the
// request-to-response map that constrains what each handler may reply with.

import type { StrategyExecutor } from "../../executor/executor";
import type { Logger } from "../../logger/logger.types";
import type { DaemonState } from "../../state/state.types";
import type { DaemonMessage } from "./messages";
import type { ErrorMessage } from "./responses/error";
import type { StrategyListMessage } from "./responses/strategy-list";
import type { PongMessage } from "./responses/pong";

// Request → Response map

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
 * // Start-strategy never sends a direct success response
 * type StartStrategyResponse = RequestResponseMap["start_strategy"]; // never
 * ```
 */
export interface RequestResponseMap {
  readonly ping: PongMessage;
  readonly start_strategy: never;
  readonly stop_strategy: never;
  readonly user_input: never;
  readonly list_strategies: StrategyListMessage;
  readonly subscribe: never;
  readonly unsubscribe: never;
}

// Handler context

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
 * // Start-strategy handler — may only reply with ErrorMessage (never = error-only)
 * function handleStartStrategy(message: StartStrategyMessage, context: HandlerContext<"start_strategy">): void {
 *   // context.reply({ type: "pong", ... }); // Type error!
 * }
 * ```
 */
export interface HandlerContext<
  RequestType extends keyof RequestResponseMap = keyof RequestResponseMap,
> {
  /** The client ID that sent this request. */
  readonly clientId: string;
  /** The strategy executor for starting/stopping runs and routing input/auth. */
  readonly executor: StrategyExecutor;
  /** Centralized daemon state for run/client/subscription tracking. */
  readonly state: DaemonState;
  /** Logger for handler-level diagnostics. */
  readonly logger: Logger;
  /** Send a response to the requesting client. Constrained by `RequestResponseMap`. */
  reply(message: RequestResponseMap[RequestType] | ErrorMessage): void;
}

// Dispatcher

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
