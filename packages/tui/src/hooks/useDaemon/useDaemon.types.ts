import type { ClientMessage, DaemonMessage } from "@comma-agents/daemon";

import type { WebSocketStatus } from "../useWebSocket/useWebSocket.types";

/**
 * Force TypeScript to eagerly expand a mapped/conditional type.
 *
 * Without this, utility types like `Omit<Extract<...>>` show as-is
 * in hover tooltips instead of the resolved object shape.
 */
export type Simplify<ObjectType> = {
  [Key in keyof ObjectType]: ObjectType[Key];
} & {};

/** Extracts the `type` literal from a DaemonMessage variant. */
export type DaemonMessageType = DaemonMessage["type"];

/** Extracts the `type` literal from a ClientMessage variant. */
export type ClientMessageType = ClientMessage["type"];

/**
 * Narrow a DaemonMessage to the variant matching a specific `type`.
 *
 * Example: `DaemonMessageOf<"agent_streaming">` resolves to the
 * `AgentStreamingMessage` branch of the union.
 */
export type DaemonMessageOf<MessageKind extends DaemonMessageType> = Simplify<
  Extract<DaemonMessage, { type: MessageKind }>
>;

/**
 * Narrow a ClientMessage to the variant matching a specific `type`.
 *
 * Example: `ClientMessageOf<"start_strategy">` resolves to the
 * `StartStrategyMessage` branch of the union.
 */
export type ClientMessageOf<CommandKind extends ClientMessageType> = Simplify<
  Extract<ClientMessage, { type: CommandKind }>
>;

/**
 * Callback for a specific daemon message type.
 * Receives the narrowed message variant — not the full union.
 */
export type DaemonMessageListener<MessageKind extends DaemonMessageType> = (
  message: DaemonMessageOf<MessageKind>,
) => void;

/** Props for the DaemonContextProvider component. */
export interface DaemonContextProviderProps {
  /** WebSocket URL for the daemon (e.g. "ws://localhost:7422/ws"). */
  readonly url: string;
  /** Child elements. */
  readonly children: React.ReactNode;
}

/** Value exposed by the DaemonContext. */
export interface DaemonContextValue {
  /** Current connection status. */
  readonly status: WebSocketStatus;
  /**
   * Send a raw client message object to the daemon.
   * Returns false if the WebSocket is not open.
   */
  readonly send: (message: Record<string, unknown>) => boolean;
  /**
   * Register a listener for a specific daemon message type.
   * Returns an unsubscribe function.
   */
  readonly on: <MessageKind extends DaemonMessageType>(
    type: MessageKind,
    listener: DaemonMessageListener<MessageKind>,
  ) => () => void;
  /** Remove a previously registered listener. */
  readonly off: <MessageKind extends DaemonMessageType>(
    type: MessageKind,
    listener: DaemonMessageListener<MessageKind>,
  ) => void;
}
