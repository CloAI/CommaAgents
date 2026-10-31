import { expect, test } from "bun:test";
import { createPlugin } from "./plugin";
import { defineCommand } from "./server";
import type { CommandContext } from "./server";
import type {
  NotifyingPlugin,
  CreateNotifyingPluginOptions,
} from "./notifications/notifications.types";
import { z } from "zod/v4";

test("base plugin names the feature and cleans up once", async () => {
  const cleanupGate = Promise.withResolvers<void>();
  let cleanups = 0;
  const plugin = createPlugin({
    name: "example",
    async cleanup() {
      cleanups++;
      await cleanupGate.promise;
    },
  });
  expect(Object.keys(plugin).sort()).toEqual(["dispose", "name"]);
  expect(plugin.name).toBe("example");
  const disposal = plugin.dispose();
  expect(plugin.dispose()).toBe(disposal);
  cleanupGate.resolve();
  await disposal;
  expect(cleanups).toBe(1);
  expect(plugin.dispose()).toBe(disposal);
});

test("explicit generic construction still returns a plugin in one call", async () => {
  const plugin = createPlugin<"explicit">({
    name: "explicit",
    async cleanup() {},
  });
  expect(plugin.name).toBe("explicit");
  await plugin.dispose();
});

test("failed cleanup shares the original failure without retrying resources", async () => {
  let cleanups = 0;
  const plugin = createPlugin({
    name: "example",
    async cleanup() {
      cleanups++;
      throw new Error("cleanup failed");
    },
  });
  const disposal = plugin.dispose();
  await expect(disposal).rejects.toThrow("cleanup failed");
  expect(plugin.dispose()).toBe(disposal);
  expect(cleanups).toBe(1);
});

interface ExampleNotifications {
  readonly changed: { readonly type: "changed"; readonly count: number };
}
interface ExamplePlugin extends NotifyingPlugin<
  "example",
  ExampleNotifications
> {}
interface ExampleContext {
  readonly count: number;
}

test("single-call construction retains inline contracts and typed notifications", async () => {
  let cleanups = 0;
  const command = defineCommand({
    name: "example.get",
    arguments: z.object({}),
    output: z.number(),
    handle({ context }: CommandContext<ExamplePlugin, ExampleContext, {}>) {
      return context.count;
    },
  });
  const { plugin, notifications } = createPlugin({
    name: "example",
    notifications: true,
    context: { count: 7 },
    server: { commands: [command] },
    notificationHooks: {
      onSubscribe(_type, _key, deliver) {
        deliver({ type: "changed", count: 1 });
      },
    },
    async cleanup() {
      cleanups++;
    },
  } satisfies CreateNotifyingPluginOptions<
    "example",
    ExampleNotifications,
    ExamplePlugin,
    ExampleContext
  >);
  expect(typeof plugin).toBe("object");
  expect(await plugin.server.commands[0]!.invoke({})).toBe(7);
  const values: number[] = [];
  await plugin.notifications.subscribe("changed", "example", (event) => {
    values.push(event.count);
  });
  notifications.notify("example", { type: "changed", count: 2 });
  expect(values).toEqual([1, 2]);

  void (() => {
    const name: "example.get" = plugin.server.commands[0]!.name;
    // @ts-expect-error Construction requires configuration and never returns a factory.
    createPlugin<"example", ExampleNotifications>();
    // @ts-expect-error Notification payloads remain inferred from the binding owner.
    notifications.notify("example", { type: "changed", count: "invalid" });
    // @ts-expect-error Inferred bindings retain literal command names.
    const wrongName: "other.command" = plugin.server.commands[0]!.name;
    void name;
    void wrongName;
  });
  await plugin.dispose();
  await plugin.dispose();
  expect(cleanups).toBe(1);
});
