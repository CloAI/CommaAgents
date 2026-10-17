import type { PluginServer, PluginServerDefinitions } from "./server";

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
