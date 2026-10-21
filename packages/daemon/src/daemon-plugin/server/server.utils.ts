import { z } from "zod/v4";
import type { ChannelMessage } from "./server.types";
import type { PluginServer, PluginServerDefinitions } from "./server.types";

/**
 * Bind feature definitions to their owning instance without exposing private context.
 * @param {PluginServerDefinitions<Owner, Context>} definitions - Feature-owned bindings.
 * @param {Owner} plugin - Instance extended by the feature factory before use.
 * @param {{ readonly context?: Context }} options - Feature context, resolved when a binding is used.
 * @returns {PluginServer} Transport-callable commands and channels.
 * @internal
 */
export function bindPluginServer<Owner, Context>(
  definitions: PluginServerDefinitions<Owner, Context>,
  plugin: Owner,
  options: { readonly context?: Context },
): PluginServer {
  return {
    ...(definitions.commands
      ? {
          commands: definitions.commands.map((command) => ({
            name: command.name,
            arguments: command.arguments,
            get invoke() {
              return command.invoke.bind(
                undefined,
                plugin,
                options.context as Context,
              );
            },
          })),
        }
      : {}),
    ...(definitions.channels
      ? {
          channels: definitions.channels.map((channel) => ({
            name: channel.name,
            arguments: channel.arguments,
            get open() {
              return channel.open.bind(
                undefined,
                plugin,
                options.context as Context,
              );
            },
          })),
        }
      : {}),
  };
}

const channelMessageSchema = z
  .object({
    type: z
      .string()
      .min(1)
      .refine(
        (type) =>
          ![
            "command",
            "subscribe",
            "unsubscribe",
            "response",
            "subscription_end",
            "event",
          ].includes(type),
      ),
    data: z.unknown(),
  })
  .strict()
  .refine((message) => Object.hasOwn(message, "data"));

/**
 * Enforce the channel envelope after feature-specific output validation.
 * @param {unknown} value - Validated feature output.
 * @returns {ChannelMessage | undefined} Domain envelope or an invalid-output marker.
 * @internal
 */
export function parseChannelMessage(
  value: unknown,
): ChannelMessage | undefined {
  const result = channelMessageSchema.safeParse(value);
  if (!result.success) {
    return undefined;
  }
  return { type: result.data.type, data: result.data.data };
}
