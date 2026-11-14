import type { PluginServer } from "../../daemon-plugin/server";

/** @internal Startup-validated command and channel lookup tables. */
export interface BindingRegistry {
  readonly commands: ReadonlyMap<
    string,
    NonNullable<PluginServer["commands"]>[number]
  >;
  readonly channels: ReadonlyMap<
    string,
    NonNullable<PluginServer["channels"]>[number]
  >;
}
