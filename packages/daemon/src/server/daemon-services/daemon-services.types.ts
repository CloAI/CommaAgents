import type {
  MessageSender,
  RequestResponseMap,
} from "../protocol/dispatcher/dispatcher.types";
import type { ClientMessage } from "../protocol/messages";
import type { ErrorMessage } from "../protocol/responses/error";

export type ClientMessageType = ClientMessage["type"];

export type ClientMessageFor<MessageType extends ClientMessageType> = Extract<
  ClientMessage,
  { readonly type: MessageType }
>;

export interface DaemonRouteContext<
  MessageType extends ClientMessageType = ClientMessageType,
> {
  /** Client that submitted the current request. */
  readonly clientId: string;
  /** Optional protocol correlation identifier. */
  readonly requestId?: string;
  /** Reply with the success type mapped to this request or an error. */
  reply(message: RequestResponseMap[MessageType] | ErrorMessage): void;
}

/** Type-erased route stored by the internal registry. @internal */
export interface DaemonRoute {
  /** Client message discriminant handled by this route. */
  readonly type: ClientMessageType;
  /** Handle one previously parsed client message. */
  handle(
    message: ClientMessage,
    context: DaemonRouteContext,
  ): Promise<void> | void;
}

/** Trusted group of related daemon routes. @internal */
export interface DaemonService {
  /** Diagnostic service name. */
  readonly name: string;
  /** Inbound routes owned by this service. */
  readonly routes: readonly DaemonRoute[];
}

/** Central inbound protocol boundary for daemon services. @internal */
export interface DaemonServiceRegistry {
  /** Parse, validate, and route one raw client frame. */
  handleMessage(clientId: string, rawMessage: string | Buffer): Promise<void>;
}

/** Dependencies used to create the daemon service registry. @internal */
export interface DaemonServiceRegistryConfig {
  /** Services registered in deterministic routing order. */
  readonly services: readonly DaemonService[];
  /** Outbound protocol delivery boundary. */
  readonly messageSender: MessageSender;
}

export type DaemonRouteHandler<MessageType extends ClientMessageType> = (
  message: ClientMessageFor<MessageType>,
  context: DaemonRouteContext<MessageType>,
) => Promise<void> | void;
