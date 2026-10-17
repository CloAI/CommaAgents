import type { Plugin } from "../../daemon-plugin";
import type { PluginServer } from "../../daemon-plugin/server";
import type { BindingRegistry } from "./registry.types";

/**
 * Collect plugin-owned bindings and reject ambiguous routing before listening.
 * @param {Readonly<Record<string, Plugin>>} plugins - Kernel-owned plugins.
 * @returns {BindingRegistry} Command and channel lookup tables.
 * @internal
 */
export function createBindingRegistry(
  plugins: Readonly<Record<string, Plugin>>,
): BindingRegistry {
  const commandBindings = new Map<
    string,
    NonNullable<PluginServer["commands"]>[number]
  >();
  const channelBindings = new Map<
    string,
    NonNullable<PluginServer["channels"]>[number]
  >();
  for (const plugin of Object.values(plugins)) {
    for (const command of plugin.server?.commands ?? []) {
      if (commandBindings.has(command.name) || !command.name.trim()) {
        throw new Error(`Invalid or duplicate command: ${command.name}`);
      }
      commandBindings.set(command.name, command);
    }
    for (const channel of plugin.server?.channels ?? []) {
      if (channelBindings.has(channel.name) || !channel.name.trim()) {
        throw new Error(`Invalid or duplicate channel: ${channel.name}`);
      }
      channelBindings.set(channel.name, channel);
    }
  }
  return { commands: commandBindings, channels: channelBindings };
}
