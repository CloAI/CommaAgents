import type { z } from "zod/v4";

/** Validation schema accepted by a plugin binding. */
export type BindingSchema = z.ZodType<unknown, unknown>;

/** Transport-independent error returned to a command or channel subscriber. */
export interface BindingError {
  /** Stable error code for client handling. */
  readonly code: string;
  /** Human-readable error description. */
  readonly message: string;
  /** Structured domain context, when supplied by a binding. */
  readonly metadata?: Readonly<Record<string, unknown>>;
}

/** Plugin-defined message; the server adds correlation and timestamp metadata. */
export interface ChannelMessage {
  /** Domain message discriminator; transport message names are reserved. */
  readonly type: string;
  /** Domain payload, kept separate from transport metadata. */
  readonly data: unknown;
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
  Name extends string = string,
> {
  /** Command name used in incoming requests. */
  readonly name: Name;
  /** Incoming argument validation. */
  readonly arguments: Arguments;
  /** Outgoing result validation. */
  readonly output: Output;
  /** Execute one domain operation and return its result. */
  readonly handle: (
    request: CommandContext<Owner, Context, z.output<Arguments>>,
  ) =>
    | z.input<Output>
    | z.output<Output>
    | Promise<z.input<Output> | z.output<Output>>;
}

/** Channel definition with owning-plugin access and an optional setup result. */
export interface ChannelDefinition<
  Owner,
  Context,
  Arguments extends BindingSchema,
  Message extends BindingSchema,
  Name extends string = string,
> {
  /** Channel name used in subscription requests. */
  readonly name: Name;
  /** Incoming subscription argument validation. */
  readonly arguments: Arguments;
  /** Validation shared by initial and live messages. */
  readonly message: Message;
  /** Attach listeners and optionally return initial state and cleanup. */
  readonly open: (
    request: CommandContext<Owner, Context, z.output<Arguments>> & {
      readonly channel: ChannelContext<z.input<Message> | z.output<Message>>;
    },
  ) =>
    | void
    | ChannelOpenResult<z.input<Message> | z.output<Message>>
    | Promise<void | ChannelOpenResult<z.input<Message> | z.output<Message>>>;
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
    channel: ChannelContext<ChannelMessage>,
  ): Promise<void | ChannelOpenResult<ChannelMessage>>;
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
      channel: ChannelContext<ChannelMessage>,
    ) => Promise<void | ChannelOpenResult<ChannelMessage>>;
  }[];
}

/** Validated command retaining its public argument and result schemas. */
export type TypedPluginCommand<
  Owner,
  Context,
  Name extends string,
  Arguments extends BindingSchema,
  Output extends BindingSchema,
> = Omit<PluginCommand<Owner, Context>, "name" | "arguments"> & {
  /** Exact wire command name. */
  readonly name: Name;
  /** Incoming arguments before defaults and transforms. */
  readonly arguments: Arguments;
  /** Result schema after command execution. */
  readonly output: Output;
};

/** Validated channel retaining its public argument and message schemas. */
export type TypedPluginChannel<
  Owner,
  Context,
  Name extends string,
  Arguments extends BindingSchema,
  Message extends BindingSchema,
> = Omit<PluginChannel<Owner, Context>, "name" | "arguments"> & {
  /** Exact wire channel name. */
  readonly name: Name;
  /** Incoming arguments before defaults and transforms. */
  readonly arguments: Arguments;
  /** Schema shared by initial and live domain messages. */
  readonly message: Message;
};

/** Bound transport definitions preserving each binding's name and schemas. */
export type BoundPluginServer<Definitions> = {
  readonly [
    Section in keyof Definitions
  ]: Definitions[Section] extends readonly (infer Binding)[]
    ? readonly (Binding extends unknown
        ? Omit<Binding, "invoke" | "open"> &
            (Section extends "commands"
              ? NonNullable<PluginServer["commands"]>[number]
              : NonNullable<PluginServer["channels"]>[number])
        : never)[]
    : never;
};
