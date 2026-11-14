import type {
  DaemonChannelMap,
  DaemonCommandMap,
  DaemonRequestError,
  PluginClientMessage,
} from "@comma-agents/daemon/protocol";

/** A failure produced locally rather than returned by the daemon. */
export interface DaemonClientError {
  /** Stable local failure category. */
  readonly code:
    | "CONNECTION_LOST"
    | "TIMEOUT"
    | "INVALID_ARGUMENTS"
    | "INVALID_MESSAGE";
  /** Explanation of the local failure. */
  readonly message: string;
}

/** Current value and progress of one operation. */
export interface DaemonResult<Data> {
  /** Latest command payload or complete channel domain event. */
  readonly data: Data | undefined;
  /** Daemon response error, preserved without wrapping. */
  readonly errors: DaemonRequestError | undefined;
  /** Local failure, separate from daemon errors. */
  readonly clientError: DaemonClientError | undefined;
  /** Whether this operation is awaiting a response or subscription acknowledgement. */
  readonly isLoading: boolean;
}

/** Result of one automatically managed command. */
export type DaemonCommandResult<Name extends keyof DaemonCommandMap> =
  DaemonResult<DaemonCommandMap[Name]["result"]>;

/** Latest event from one automatically managed subscription. */
export type DaemonChannelResult<Name extends keyof DaemonChannelMap> =
  DaemonResult<DaemonChannelMap[Name]["message"]>;

/** @internal JSON arguments accepted by the daemon envelope. */
export type DaemonArguments = Extract<
  PluginClientMessage,
  { type: "command" }
>["arguments"];
/** @internal Discriminated operation selector. */
export type DaemonOperation =
  | { readonly command: keyof DaemonCommandMap }
  | { readonly channel: keyof DaemonChannelMap };
/** @internal Updates only the owning operation's state. */
export type DaemonListener = (update: Partial<DaemonResult<unknown>>) => void;
/** @internal Stable shared request operations; connection events do not replace this context. */
export interface DaemonContextValue {
  readonly endpoint: string;
  readonly command: (
    name: string,
    argumentsValue: DaemonArguments,
    listener: DaemonListener,
  ) => () => void;
  readonly subscribe: (
    name: string,
    argumentsValue: DaemonArguments,
    listener: DaemonListener,
  ) => () => void;
}
/** @internal Registry entry owned by one mounted request hook. */
export interface DaemonRequest {
  id: string;
  readonly kind: "command" | "channel";
  readonly name: string;
  readonly arguments: DaemonArguments;
  readonly listener: DaemonListener;
  /** Client-only tracking of whether this operation was sent on the current connection. */
  sent: boolean;
  timer?: number;
}
/** @internal Canonical argument JSON, or a local validation error. */
export type PreparedArguments =
  | { readonly key: string }
  | { readonly error: DaemonClientError };
