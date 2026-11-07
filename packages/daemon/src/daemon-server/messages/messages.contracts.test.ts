import { describe, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createDaemonKernel } from "../../daemon-kernel/daemon-kernel";
import { createBindingRegistry } from "../registry/registry";
import {
  defineCommand,
  defineChannel,
  createPlugin,
} from "../../daemon-plugin";
import { z } from "zod/v4";
import type {
  DaemonCommandMap,
  DaemonChannelMap,
  PluginCommandMap,
  PluginChannelMap,
} from "./messages.contracts.types";

// Every map entry must be represented; runtime registration checks below detect widening or omissions.
const commandNames = {
  "core.strategies.list": true,
  "core.strategies.describe": true,
  "core.modelRoles.get": true,
  "core.modelRoles.set": true,
  "core.providers.refresh": true,
  "core.providers.beginSignIn": true,
  "core.providers.getSignInStatus": true,
  "core.providers.cancelSignIn": true,
  "core.providers.getConfiguration": true,
  "core.providers.configure": true,
  "core.providers.verify": true,
  "core.providers.removeCredential": true,
  "core.providers.addCustomProvider": true,
  "core.providers.updateCustomProvider": true,
  "core.providers.removeCustomProvider": true,
  "core.providers.addCustomProviderModel": true,
  "core.providers.removeCustomProviderModel": true,

  "status.get": true,
  "runs.prepare": true,
  "runs.switchStrategy": true,
  "runs.send": true,
  "runs.start": true,
  "runs.stop": true,
  "runs.steer": true,
  "runs.resolveInput": true,
  "runs.get": true,
  "runs.history": true,
  "questions.answer": true,
} satisfies Record<keyof DaemonCommandMap, true>;
const channelNames = {
  "core.providers.list": true,
  "core.modelRoles.watch": true,
  "status.watch": true,
  runs: true,
  "questions.watch": true,
} satisfies Record<keyof DaemonChannelMap, true>;

function checkBuiltinContracts() {
  const providerArguments: DaemonCommandMap["core.providers.configure"]["arguments"] =
    {
      providerId: "openai",
      apiKey: "example-key",
    };
  const providerOutput: DaemonCommandMap["core.providers.getConfiguration"]["result"]["credentialSource"] =
    "environment";
  const providerId: DaemonChannelMap["core.providers.list"]["message"]["data"]["providers"][number]["id"] =
    "openai";
  const verificationStatus: DaemonCommandMap["core.providers.verify"]["result"]["status"] =
    "verified";
  // @ts-expect-error Configuration requires an API key, not discovery options.
  const missingProviderKey: DaemonCommandMap["core.providers.configure"]["arguments"] =
    { providerId: "openai" };
  // @ts-expect-error A standalone configuration response has no provider-list wrapper.
  const wrongProviderOutput: DaemonCommandMap["core.providers.getConfiguration"]["result"]["providers"] =
    [];
  // @ts-expect-error Provider output fields must retain concrete types.
  const wrongProviderSource: DaemonCommandMap["core.providers.getConfiguration"]["result"]["credentialSource"] = 42;
  // @ts-expect-error Verification result must not widen to unrelated command result fields.
  const wrongVerificationStatus: DaemonCommandMap["core.providers.verify"]["result"]["status"] =
    "configured";
  void providerArguments;
  void providerOutput;
  void providerId;
  void verificationStatus;
  void missingProviderKey;
  void wrongProviderOutput;
  void wrongProviderSource;
  void wrongVerificationStatus;
  const argumentsValue: DaemonCommandMap["runs.get"]["arguments"] = {
    runId: "run",
  };
  const defaultArguments: DaemonCommandMap["runs.history"]["arguments"] = {
    runId: "run",
  };
  // @ts-expect-error A known command requires its own arguments.
  const missingArguments: DaemonCommandMap["runs.get"]["arguments"] = {};
  // @ts-expect-error Unknown commands do not appear in the map.
  const unknownCommand: keyof DaemonCommandMap = "runs.unknown";
  // @ts-expect-error Output inference must retain the actual command result.
  const invalidOutput: DaemonCommandMap["status.get"]["result"]["phase"] =
    "invalid";
  // @ts-expect-error Channel messages retain the domain discriminator.
  const invalidMessage: DaemonChannelMap["runs"]["message"]["type"] = "unknown";
  return [
    argumentsValue,
    defaultArguments,
    missingArguments,
    unknownCommand,
    invalidOutput,
    invalidMessage,
  ];
}
void checkBuiltinContracts;

describe("daemon protocol contracts", () => {
  test("should cover every command and channel registered by the actual kernel", async () => {
    const runsDir = await mkdtemp(join(tmpdir(), "daemon-contracts-"));
    const kernel = await createDaemonKernel({ runs: { runsDir } });
    try {
      const registry = createBindingRegistry(kernel.plugins);
      expect([...registry.commands.keys()].sort()).toEqual(
        Object.keys(commandNames).sort(),
      );
      expect([...registry.channels.keys()].sort()).toEqual(
        Object.keys(channelNames).sort(),
      );
    } finally {
      await kernel.dispose();
      await rm(runsDir, { recursive: true, force: true });
    }
  });

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
    expect(defaultArguments).toEqual({});
    expect(output.count).toBe(1);
    expect(message.type).toBe("updated");
    expect(plugin.server.commands[0]?.name).toBe("example.get");
  });
});
