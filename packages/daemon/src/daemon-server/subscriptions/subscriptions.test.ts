import { describe, expect, it } from "bun:test";
import { z } from "zod/v4";
import { createPlugin, defineChannel } from "../../daemon-plugin";
import type { ChannelContext, CommandContext } from "../../daemon-plugin";
import { createSubscription } from "./subscriptions";
import type { MessageSender } from "../messages/messages.types";

describe("createSubscription", () => {
  it("should abort before cleaning an invalid initial message and release resources once", async () => {
    let cleanups = 0;
    const plugin = createPlugin({
      name: "invalid-initial",
      async cleanup() {},
      server: {
        channels: [
          defineChannel({
            name: "invalid.watch",
            arguments: z.object({}),
            message: z.number().finite(),
            open({
              channel,
            }: CommandContext<unknown, unknown, Record<string, never>> & {
              readonly channel: ChannelContext<number>;
            }) {
              return {
                initial: Number.NaN,
                cleanup() {
                  expect(channel.signal.aborted).toBe(true);
                  cleanups++;
                },
              };
            },
          }),
        ],
      },
    });
    const messages: Parameters<MessageSender>[0][] = [];
    const subscription = createSubscription({
      requestId: crypto.randomUUID(),
      arguments: {},
      channel: plugin.server!.channels![0]!,
      send(message) {
        messages.push(message);
      },
      onClose() {},
    });
    await subscription.ready;
    expect(messages).toMatchObject([
      { type: "response", ok: false, error: { code: "INVALID_OUTPUT" } },
    ]);
    await subscription.close();
    expect(cleanups).toBe(1);
  });
  it("should buffer setup emissions and clean resources acquired after disconnect", async () => {
    const opened = Promise.withResolvers<void>();
    const release = Promise.withResolvers<void>();
    const messages: Parameters<MessageSender>[0][] = [];
    let cleanups = 0;
    let signal: AbortSignal | undefined;
    const definition = defineChannel({
      name: "example",
      arguments: z.object({}),
      message: z.number(),
      async open({
        channel,
      }: CommandContext<undefined, undefined, Record<string, never>> & {
        readonly channel: ChannelContext<number>;
      }) {
        signal = channel.signal;
        channel.send(1);
        opened.resolve();
        await release.promise;
        return {
          initial: 0,
          cleanup() {
            cleanups++;
          },
        };
      },
    });
    const subscription = createSubscription({
      requestId: crypto.randomUUID(),
      arguments: {},
      channel: {
        name: definition.name,
        arguments: definition.arguments,
        open(channelArguments, channel) {
          return definition.open(
            undefined,
            undefined,
            channelArguments,
            channel,
          );
        },
      },
      send(message) {
        messages.push(message);
      },
      onClose() {},
    });
    await opened.promise;
    expect(messages).toEqual([]);
    const closing = subscription.close();
    expect(signal?.aborted).toBe(true);
    release.resolve();
    await closing;
    await subscription.close();
    expect(cleanups).toBe(1);
    expect(messages).toEqual([]);
  });

  it("should fail initialization with one response and abort setup resources", async () => {
    const messages: Parameters<MessageSender>[0][] = [];
    let aborted = false;
    let closed = 0;
    const subscription = createSubscription({
      requestId: crypto.randomUUID(),
      arguments: {},
      channel: {
        name: "failure",
        arguments: z.object({}),
        async open(_arguments, channel) {
          channel.signal.addEventListener("abort", () => {
            aborted = true;
          });
          channel.send({ type: "test.buffered", data: "buffered" });
          throw Object.assign(new Error("Setup failed"), {
            code: "SETUP_FAILED",
          });
        },
      },
      send(message) {
        messages.push(message);
      },
      onClose() {
        closed++;
      },
    });
    await subscription.ready;
    expect(messages).toMatchObject([
      { type: "response", ok: false, error: { code: "SETUP_FAILED" } },
    ]);
    expect(aborted).toBe(true);
    expect(closed).toBe(1);
    await subscription.close();
    expect(closed).toBe(1);
  });
});
