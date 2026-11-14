import { describe, expect, test } from "vitest";
import {
  defineCommand,
  defineChannel,
  createPlugin,
} from "../../daemon-plugin";
import { z } from "zod/v4";
import type {
  PluginCommandMap,
  PluginChannelMap,
} from "./messages.contracts.types";

describe("plugin binding contract inference", () => {
  test("should infer newly registered plugin bindings without a separate catalog", () => {
    const { plugin } = createPlugin({
      name: "example",
      notifications: true,
      async cleanup() {},
      server: {
        commands: [
          defineCommand({
            name: "example.get",
            arguments: z.object({ count: z.number().default(1) }),
            output: z.object({ count: z.number() }),
            handle({ arguments: commandArguments }) {
              return commandArguments;
            },
          }),
        ],
        channels: [
          defineChannel({
            name: "example.watch",
            arguments: z.object({ key: z.string() }),
            message: z.object({ type: z.literal("updated"), data: z.string() }),
            open() {},
          }),
        ],
      },
    });
    type Commands = PluginCommandMap<{ readonly example: typeof plugin }>;
    type Channels = PluginChannelMap<{ readonly example: typeof plugin }>;
    const defaultArguments: Commands["example.get"]["arguments"] = {};
    const output: Commands["example.get"]["result"] = { count: 1 };
    const message: Channels["example.watch"]["message"] = {
      type: "updated",
      data: "value",
    };
    // @ts-expect-error Unknown bindings must not enter the inferred map.
    const unknownCommand: keyof Commands = "example.unknown";
    type ExampleArguments = Commands["example.get"]["arguments"];
    // @ts-expect-error Defaulted input still requires a numeric value when supplied.
    const invalidArguments: ExampleArguments = { count: "one" };
    // @ts-expect-error Parsed outputs retain their concrete value types.
    const invalidOutput: Commands["example.get"]["result"] = { count: "one" };
    // @ts-expect-error Channel discriminators remain specific to their binding.
    const invalidEvent: Channels["example.watch"]["message"]["type"] = "other";
    void unknownCommand;
    void invalidArguments;
    void invalidOutput;
    void invalidEvent;
    expect(defaultArguments).toEqual({});
    expect(output.count).toBe(1);
    expect(message.type).toBe("updated");
    expect(plugin.server.commands[0]?.name).toBe("example.get");
  });
});
