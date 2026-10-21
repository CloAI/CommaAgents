import { parseChannelMessage } from "./server.utils";
import type {
  BindingSchema,
  ChannelDefinition,
  CommandDefinition,
  PluginChannel,
  PluginCommand,
} from "./server.types";

/**
 * Define a command that validates arguments and results at the plugin boundary.
 * @param {CommandDefinition<Owner, Context, Arguments, Output>} definition - Command schemas and owning-plugin handler.
 * @returns {PluginCommand<Owner, Context>} Validated command binding.
 * @example
 * const command = defineCommand({ name: "status.get", arguments: inputSchema, output: statusSchema, handle });
 */
export function defineCommand<
  Owner,
  Context,
  Arguments extends BindingSchema,
  Output extends BindingSchema,
>(
  definition: CommandDefinition<Owner, Context, Arguments, Output>,
): PluginCommand<Owner, Context> {
  return {
    name: definition.name,
    arguments: definition.arguments,
    async invoke(plugin, context, commandArguments) {
      const parsedArguments = definition.arguments.parse(commandArguments);
      const output = await definition.handle({
        plugin,
        context,
        arguments: parsedArguments,
      });
      const parsedOutput = definition.output.safeParse(output);
      if (!parsedOutput.success) {
        throw Object.assign(new Error("Command returned an invalid result"), {
          code: "INVALID_OUTPUT",
        });
      }
      return parsedOutput.data;
    },
  };
}

/**
 * Define a channel with validated arguments, live messages, and initial output.
 * @param {ChannelDefinition<Owner, Context, Arguments, Message>} definition - Channel schemas and owning-plugin setup function.
 * @returns {PluginChannel<Owner, Context>} Validated channel binding.
 * @example
 * const channel = defineChannel({ name: "status.watch", arguments: inputSchema, message: statusSchema, open });
 */
export function defineChannel<
  Owner,
  Context,
  Arguments extends BindingSchema,
  Message extends BindingSchema,
>(
  definition: ChannelDefinition<Owner, Context, Arguments, Message>,
): PluginChannel<Owner, Context> {
  return {
    name: definition.name,
    arguments: definition.arguments,
    async open(plugin, context, channelArguments, channel) {
      const result = await definition.open({
        plugin,
        context,
        arguments: definition.arguments.parse(channelArguments),
        channel: {
          signal: channel.signal,
          end: channel.end,
          send(message) {
            const parsedMessage = definition.message.safeParse(message);
            const outgoing = parsedMessage.success
              ? parseChannelMessage(parsedMessage.data)
              : undefined;
            if (!outgoing) {
              channel.end({
                code: "INVALID_OUTPUT",
                message: "Channel produced an invalid message",
              });
              return;
            }
            channel.send(outgoing);
          },
        },
      });
      if (!result || result.initial === undefined) {
        return result ? { cleanup: result.cleanup } : undefined;
      }
      const initial = definition.message.safeParse(result.initial);
      const outgoing = initial.success
        ? parseChannelMessage(initial.data)
        : undefined;
      if (!outgoing) {
        channel.end({
          code: "INVALID_OUTPUT",
          message: "Channel produced an invalid initial message",
        });
        await result.cleanup?.();
        throw Object.assign(
          new Error("Channel produced an invalid initial message"),
          { code: "INVALID_OUTPUT" },
        );
      }
      return { ...result, initial: outgoing };
    },
  };
}
