import { z } from "zod/v4";
import { createPlugin, defineCommand, defineChannel } from "../daemon-plugin";
import type { Plugin, CommandContext, ChannelContext } from "../daemon-plugin";
import type { PluginServerMessage } from "./messages";

const countMessageSchema = z
  .object({ type: z.literal("counter.updated"), data: z.number().finite() })
  .strict();

interface CounterPlugin extends Plugin<"counter"> {
  add(value: number): number;
}

interface CounterContext {
  count: number;
  cleanups: number;
  disposed: boolean;
  readonly listeners: Set<(count: number) => void>;
}

/**
 * A real plugin whose bindings exercise both private context and public methods.
 * @returns {{ plugin: CounterPlugin, context: CounterContext }} Counter service and assertions state.
 * @internal
 */
export function counterPlugin() {
  const context: CounterContext = {
    count: 0,
    cleanups: 0,
    disposed: false,
    listeners: new Set(),
  };
  const plugin = createPlugin<"counter", CounterPlugin, CounterContext>({
    name: "counter",
    context,
    async cleanup() {
      context.disposed = true;
    },
    server: {
      commands: [
        defineCommand({
          name: "counter.add",
          arguments: z.object({ value: z.number() }).strict(),
          output: z.number().finite(),
          handle({
            plugin,
            arguments: { value },
          }: CommandContext<CounterPlugin, CounterContext, { value: number }>) {
            return plugin.add(value);
          },
        }),
        defineCommand({
          name: "counter.fail",
          arguments: z.object({}).strict(),
          output: z.null(),
          handle() {
            throw Object.assign(new Error("Counter rejected the command"), {
              code: "COUNTER_ERROR",
            });
          },
        }),
        defineCommand({
          name: "counter.invalid",
          arguments: z.object({}).strict(),
          output: z.number().finite(),
          handle() {
            return Number.NaN;
          },
        }),
      ],
      channels: [
        defineChannel({
          name: "counter.watch",
          arguments: z.object({}).strict(),
          message: countMessageSchema,
          async open({
            context,
            channel,
          }: CommandContext<
            CounterPlugin,
            CounterContext,
            Record<string, never>
          > & {
            readonly channel: ChannelContext<{
              type: "counter.updated";
              data: number;
            }>;
          }) {
            function onCount(count: number): void {
              channel.send({ type: "counter.updated", data: count });
            }
            context.listeners.add(onCount);
            return {
              initial: {
                type: "counter.updated" as const,
                data: context.count,
              },
              cleanup() {
                context.cleanups++;
                context.listeners.delete(onCount);
              },
            };
          },
        }),
        defineChannel({
          name: "counter.empty",
          arguments: z.object({}).strict(),
          message: countMessageSchema,
          open() {},
        }),
        defineChannel({
          name: "counter.complete",
          arguments: z.object({}).strict(),
          message: countMessageSchema,
          open({
            channel,
          }: CommandContext<
            CounterPlugin,
            CounterContext,
            Record<string, never>
          > & {
            readonly channel: ChannelContext<{
              type: "counter.updated";
              data: number;
            }>;
          }) {
            channel.send({ type: "counter.updated", data: 1 });
            channel.end();
            channel.end();
            return {
              cleanup() {
                context.cleanups++;
              },
            };
          },
        }),
        defineChannel({
          name: "counter.invalid",
          arguments: z.object({}).strict(),
          message: countMessageSchema,
          open({
            channel,
          }: CommandContext<
            CounterPlugin,
            CounterContext,
            Record<string, never>
          > & {
            readonly channel: ChannelContext<{
              type: "counter.updated";
              data: number;
            }>;
          }) {
            channel.send({ type: "counter.updated", data: Number.NaN });
          },
        }),
      ],
    },
  });
  return {
    context,
    plugin: Object.assign(plugin, {
      add(value: number) {
        context.count += value;
        for (const listener of context.listeners) {
          listener(context.count);
        }
        return context.count;
      },
    }),
  };
}

/**
 * Open a WebSocket with deterministic, ordered message consumption.
 * @param {string} url - WebSocket server address.
 * @returns {Promise<object>} Client and ordered message reader.
 * @internal
 */
export async function connectSocket(url: string) {
  const socket = new WebSocket(url);
  const messages: PluginServerMessage[] = [];
  const readers: Array<(message: PluginServerMessage) => void> = [];
  const opened = Promise.withResolvers<void>();
  const closed = Promise.withResolvers<CloseEvent>();
  socket.addEventListener("open", () => opened.resolve(), { once: true });
  socket.addEventListener(
    "error",
    () => opened.reject(new Error("WebSocket connection failed")),
    { once: true },
  );
  socket.addEventListener("close", (event) => closed.resolve(event), {
    once: true,
  });
  socket.addEventListener("message", (event) => {
    const message = JSON.parse(String(event.data)) as PluginServerMessage;
    const reader = readers.shift();
    if (reader) {
      reader(message);
    } else {
      messages.push(message);
    }
  });
  await opened.promise;
  return {
    socket,
    closed: closed.promise,
    send(message: unknown) {
      socket.send(JSON.stringify(message));
    },
    next(): Promise<PluginServerMessage> {
      const message = messages.shift();
      if (message) {
        return Promise.resolve(message);
      }
      return new Promise((resolve) => readers.push(resolve));
    },
  };
}
