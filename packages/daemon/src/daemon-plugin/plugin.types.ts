import type { PluginServer, PluginServerDefinitions } from "./server";
import type { BoundPluginServer } from "./server/server.types";
import type {
  CreateNotifyingPluginOptions,
  CreatedNotifyingPlugin,
  NotifyingPlugin,
  NotificationHooks,
} from "./notifications/notifications.types";

/** Common identity and cleanup contract implemented by feature plugins. */
export interface Plugin<PluginName extends string = string> {
  /** Stable feature name. */
  readonly name: PluginName;
  /** Optional commands and channels bound to this plugin. */
  readonly server?: PluginServer;
  /** Stop active work and release owned resources once. */
  dispose(): Promise<void>;
}

/** Dependencies used by a feature to construct its base plugin. */
export interface CreatePluginOptions<
  PluginName extends string,
  Owner = Plugin<PluginName>,
  Context = undefined,
> {
  /** Stable feature name. */
  readonly name: PluginName;
  /** Feature-specific resource cleanup. */
  readonly cleanup: () => Promise<void>;
  /** Omit for a plain plugin without subscriptions. */
  readonly notifications?: false;
  /** Private context available only to this plugin's bindings. */
  readonly context?: Context;
  /** Optional feature-owned transport definitions. */
  readonly server?: PluginServerDefinitions<Owner, Context>;
}

/** @internal Single-call configuration whose concrete bindings remain inferable. */
export type InferredPluginOptions =
  | CreatePluginOptions<string, never, unknown>
  | Omit<
      CreateNotifyingPluginOptions<string, {}, never, unknown>,
      "notificationHooks"
    >;

/** @internal Notification collection already declared by the registered bindings' owner. */
type DeclaredNotifications<Options> = Options extends {
  readonly server: PluginServerDefinitions<infer Owner, infer _Context>;
}
  ? Owner extends NotifyingPlugin<string, infer Collection>
    ? Collection
    : {}
  : {};

/** @internal Preserve notification payloads and their declared discriminators. */
type InferredNotifications<Options> = {
  readonly [
    Type in keyof DeclaredNotifications<Options>
  ]: DeclaredNotifications<Options>[Type] & {
    readonly type: Type;
  };
};

/** @internal Check notification callbacks against the collection declared by binding owners. */
export type InferredPluginHooks<Options> = {
  readonly notificationHooks?: NotificationHooks<
    InferredNotifications<Options>
  >;
};

/** @internal Plugin result preserving the actual inline server definitions. */
export type InferredPluginResult<Options extends InferredPluginOptions> =
  Options extends { readonly notifications: true }
    ? Omit<
        CreatedNotifyingPlugin<Options["name"], InferredNotifications<Options>>,
        "plugin"
      > & {
        /** Public plugin with the schemas of its registered server bindings. */
        readonly plugin: NotifyingPlugin<
          Options["name"],
          InferredNotifications<Options>
        > &
          (Options extends { readonly server: infer Definitions }
            ? { readonly server: BoundPluginServer<Definitions> }
            : unknown);
      }
    : Plugin<Options["name"]> &
        (Options extends { readonly server: infer Definitions }
          ? { readonly server: BoundPluginServer<Definitions> }
          : unknown);
