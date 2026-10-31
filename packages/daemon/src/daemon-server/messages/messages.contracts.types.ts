import type { z } from "zod/v4";
import type { createDaemonKernel } from "../../daemon-kernel/daemon-kernel";
import type { BindingSchema } from "../../daemon-plugin/server/server.types";
import type { PluginServerMessage } from "./messages.types";

type RegisteredBindings<Plugins, Section extends "commands" | "channels"> = {
  [Name in keyof Plugins]: Plugins[Name] extends {
    readonly server: infer Server;
  }
    ? Server extends { readonly [Field in Section]: readonly (infer Binding)[] }
      ? Binding
      : never
    : never;
}[keyof Plugins];

/** Command contracts inferred from the registered server bindings of a plugin collection. */
export type PluginCommandMap<Plugins> = {
  readonly [
    Binding in Extract<
      RegisteredBindings<Plugins, "commands">,
      {
        readonly name: string;
        readonly arguments: BindingSchema;
        readonly output: BindingSchema;
      }
    > as Binding["name"]
  ]: {
    /** Accepted command arguments, before server defaults and transformations. */
    readonly arguments: z.input<Binding["arguments"]>;
    /** Validated command response data. */
    readonly result: z.output<Binding["output"]>;
  };
};

/** Channel contracts inferred from the registered server bindings of a plugin collection. */
export type PluginChannelMap<Plugins> = {
  readonly [
    Binding in Extract<
      RegisteredBindings<Plugins, "channels">,
      {
        readonly name: string;
        readonly arguments: BindingSchema;
        readonly message: BindingSchema;
      }
    > as Binding["name"]
  ]: {
    /** Accepted subscription arguments, before server defaults and transformations. */
    readonly arguments: z.input<Binding["arguments"]>;
    /** Validated initial or live domain event. */
    readonly message: z.output<Binding["message"]>;
  };
};

type KernelPlugins = Awaited<ReturnType<typeof createDaemonKernel>>["plugins"];

/** Built-in daemon command names mapped to their inferred arguments and results. */
export type DaemonCommandMap = PluginCommandMap<KernelPlugins>;
/** Built-in daemon channel names mapped to their inferred arguments and domain events. */
export type DaemonChannelMap = PluginChannelMap<KernelPlugins>;
/** Unmodified error structure supplied by a failed daemon response. */
export type DaemonRequestError = Extract<
  PluginServerMessage,
  { type: "response"; ok: false }
>["error"];
