import type { z } from "zod";

/** Validation schema accepted by a plugin binding. */
export type BindingSchema = z.ZodType<unknown, z.ZodTypeDef, unknown>;

/** Transport-independent error returned to a command or channel subscriber. */
export interface BindingError {
  /** Stable error code for client handling. */
  readonly code: string;
  /** Human-readable error description. */
  readonly message: string;
}

/** Operations available to an open server-to-client channel. */
export interface ChannelContext<Message> {
  /** Deliver one message, after subscription acknowledgement and initialization. */
  readonly send: (message: Message) => void;
  /** Complete the subscription, or fail it with domain error details. */
  readonly end: (error?: BindingError) => void;
  /** Aborted on unsubscribe, disconnect, setup failure, or channel completion. */
  readonly signal: AbortSignal;
}

/** Optional initial message and resources acquired while opening a channel. */
export interface ChannelOpenResult<Message> {
  /** Optional message delivered before live emissions buffered during setup. */
  readonly initial?: Message;
  /** Resources to release once when the subscription ends. */
  readonly cleanup?: () => void | Promise<void>;
}

/** Owning plugin, private feature context, and validated command arguments. */
export interface CommandContext<Owner, Context, Arguments> {
  /** Owning plugin's public methods and notifications. */
  readonly plugin: Owner;
  /** Private state belonging to this plugin alone. */
  readonly context: Context;
  /** Arguments after schema validation and defaults. */
  readonly arguments: Arguments;
}

/** Command definition with colocated argument and result schemas. */
export interface CommandDefinition<
  Owner,
  Context,
  Arguments extends BindingSchema,
  Output extends BindingSchema,
> {
  /** Command name used in incoming requests. */
  readonly name: string;
  /** Incoming argument validation. */
  readonly arguments: Arguments;
  /** Outgoing result validation. */
  readonly output: Output;
  /** Execute one domain operation and return its result. */
  readonly handle: (
    request: CommandContext<Owner, Context, z.output<Arguments>>,
  ) => z.input<Output> | Promise<z.input<Output>>;
}

/** Channel definition with owning-plugin access and an optional setup result. */
export interface ChannelDefinition<
  Owner,
  Context,
  Arguments extends BindingSchema,
  Message extends BindingSchema,
> {
  /** Channel name used in subscription requests. */
  readonly name: string;
  /** Incoming subscription argument validation. */
  readonly arguments: Arguments;
  /** Validation shared by initial and live messages. */
  readonly message: Message;
  /** Attach listeners and optionally return initial state and cleanup. */
  readonly open: (
    request: CommandContext<Owner, Context, z.output<Arguments>> & {
      readonly channel: ChannelContext<z.input<Message>>;
    },
  ) =>
    | void
    | ChannelOpenResult<z.input<Message>>
    | Promise<void | ChannelOpenResult<z.input<Message>>>;
}

/** @internal Schema-checked command awaiting its owning plugin and context. */
export interface PluginCommand<Owner, Context> {
  readonly name: string;
  readonly arguments: BindingSchema;
  invoke(
    plugin: Owner,
    context: Context,
    commandArguments: unknown,
  ): Promise<unknown>;
}

/** @internal Schema-checked channel awaiting its owning plugin and context. */
export interface PluginChannel<Owner, Context> {
  readonly name: string;
  readonly arguments: BindingSchema;
  open(
    plugin: Owner,
    context: Context,
    channelArguments: unknown,
    channel: ChannelContext<unknown>,
  ): Promise<void | ChannelOpenResult<unknown>>;
}

/** Optional transport bindings supplied when constructing a plugin. */
export interface PluginServerDefinitions<Owner, Context> {
  /** Optional commands owned by this feature. */
  readonly commands?: readonly PluginCommand<Owner, Context>[];
  /** Optional channels owned by this feature. */
  readonly channels?: readonly PluginChannel<Owner, Context>[];
}

/** Server-discoverable bindings already associated with their owning plugin. */
export interface PluginServer {
  /** Bound commands available for server discovery. */
  readonly commands?: readonly {
    readonly name: string;
    readonly arguments: BindingSchema;
    readonly invoke: (commandArguments: unknown) => Promise<unknown>;
  }[];
  /** Bound channels available for server discovery. */
  readonly channels?: readonly {
    readonly name: string;
    readonly arguments: BindingSchema;
    readonly open: (
      channelArguments: unknown,
      channel: ChannelContext<unknown>,
    ) => Promise<void | ChannelOpenResult<unknown>>;
  }[];
}
