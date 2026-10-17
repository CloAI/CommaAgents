import type { PluginServer, PluginServerDefinitions } from "./server.types";

/**
 * Bind feature definitions to their owning instance without exposing private context.
 * @param {PluginServerDefinitions<Owner, Context>} definitions - Feature-owned bindings.
 * @param {Owner} plugin - Instance extended by the feature factory before use.
 * @param {Context} context - Private feature state.
 * @returns {PluginServer} Transport-callable commands and channels.
 * @internal
 */
export function bindPluginServer<Owner, Context>(
  definitions: PluginServerDefinitions<Owner, Context>,
  plugin: Owner,
  context: Context,
): PluginServer {
  return {
    ...(definitions.commands
      ? {
          commands: definitions.commands.map((command) => ({
            name: command.name,
            arguments: command.arguments,
            invoke: command.invoke.bind(undefined, plugin, context),
          })),
        }
      : {}),
    ...(definitions.channels
      ? {
          channels: definitions.channels.map((channel) => ({
            name: channel.name,
            arguments: channel.arguments,
            open: channel.open.bind(undefined, plugin, context),
          })),
        }
      : {}),
  };
}
