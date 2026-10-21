import { afterEach, describe, expect, it } from "bun:test";
import { createDaemonServer } from "./daemon-server";
import type { DaemonServer } from "./daemon-server.types";
import { connectSocket, counterPlugin } from "./test.utils";
import { createPlugin, defineChannel } from "../daemon-plugin";
import { z } from "zod/v4";
import { createDaemonKernel } from "../daemon-kernel/daemon-kernel";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const servers: DaemonServer[] = [];
afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) => server.stop()));
});

describe("createDaemonServer", () => {
  it("should await subscription cleanup when stopping the listener", async () => {
    const cleaning = Promise.withResolvers<void>();
    const release = Promise.withResolvers<void>();
    let cleaned = false;
    const plugin = createPlugin({
      name: "cleanup",
      async cleanup() {},
      server: {
        channels: [
          defineChannel({
            name: "cleanup.watch",
            arguments: z.object({}).strict(),
            message: z.null(),
            open() {
              return {
                async cleanup() {
                  cleaning.resolve();
                  await release.promise;
                  cleaned = true;
                },
              };
            },
          }),
        ],
      },
    });
    const server = createDaemonServer({
      daemon: { plugins: { cleanup: plugin } },
      port: 0,
    });
    servers.push(server);
    await server.start();
    const client = await connectSocket(server.url);
    client.send({
      type: "subscribe",
      requestId: crypto.randomUUID(),
      channel: "cleanup.watch",
      arguments: {},
    });
    await client.next();
    const stopping = server.stop();
    try {
      await cleaning.promise;
      expect(cleaned).toBe(false);
    } finally {
      release.resolve();
      await stopping;
    }
    expect(cleaned).toBe(true);
  });
  it("should expose kernel status and leave the daemon running after server shutdown", async () => {
    const runsDir = mkdtempSync(join(tmpdir(), "plugin-server-"));
    const daemon = await createDaemonKernel({ runs: { runsDir } });
    try {
      const server = createDaemonServer({ daemon, port: 0 });
      servers.push(server);
      await server.start();
      const client = await connectSocket(server.url);
      const requestId = crypto.randomUUID();
      client.send({
        type: "subscribe",
        requestId,
        channel: "status.watch",
        arguments: {},
      });
      expect(await client.next()).toMatchObject({
        type: "response",
        requestId,
        ok: true,
      });
      expect(await client.next()).toMatchObject({
        type: "status.updated",
        requestId,
        data: { phase: "running" },
      });
      client.send({
        type: "command",
        requestId: crypto.randomUUID(),
        command: "status.get",
        arguments: {},
      });
      expect(await client.next()).toMatchObject({
        type: "response",
        ok: true,
        data: { phase: "running" },
      });
      await server.stop();
      await client.closed;
      expect(daemon.plugins.status.getStatus().phase).toBe("running");
      expect(daemon.plugins.runs.server?.channels?.[0]?.name).toBe("runs");
      await daemon.dispose();
      expect(daemon.plugins.status.getStatus().phase).toBe("stopped");
    } finally {
      await daemon.dispose();
      rmSync(runsDir, { recursive: true, force: true });
    }
  });
  it("should route commands to their owning plugin and private context", async () => {
    const { plugin, context } = counterPlugin();
    const server = createDaemonServer({
      daemon: { plugins: { counter: plugin } },
      port: 0,
    });
    servers.push(server);
    await server.start();
    const client = await connectSocket(server.url);
    const requestId = crypto.randomUUID();
    client.send({
      type: "command",
      requestId,
      command: "counter.add",
      arguments: { value: 3 },
    });
    expect(await client.next()).toMatchObject({
      type: "response",
      requestId,
      ok: true,
      data: 3,
    });
    expect(context.count).toBe(3);
    client.send({
      type: "command",
      requestId: crypto.randomUUID(),
      command: "counter.fail",
      arguments: {},
    });
    expect(await client.next()).toMatchObject({
      type: "response",
      ok: false,
      error: { code: "COUNTER_ERROR" },
    });
    client.send({
      type: "command",
      requestId: crypto.randomUUID(),
      command: "counter.invalid",
      arguments: {},
    });
    expect(await client.next()).toMatchObject({
      type: "response",
      ok: false,
      error: { code: "INVALID_OUTPUT" },
    });
  });

  it("should acknowledge before initial and live messages and unsubscribe using the same requestId", async () => {
    const { plugin, context } = counterPlugin();
    const server = createDaemonServer({
      daemon: { plugins: { counter: plugin } },
      port: 0,
    });
    servers.push(server);
    await server.start();
    const client = await connectSocket(server.url);
    const requestId = crypto.randomUUID();
    client.send({
      type: "subscribe",
      requestId,
      channel: "counter.watch",
      arguments: {},
    });
    expect(await client.next()).toMatchObject({
      type: "response",
      requestId,
      ok: true,
      data: null,
    });
    expect(await client.next()).toMatchObject({
      type: "counter.updated",
      requestId,
      data: 0,
    });
    plugin.add(2);
    expect(await client.next()).toMatchObject({
      type: "counter.updated",
      requestId,
      data: 2,
    });
    client.send({ type: "unsubscribe", requestId });
    expect(await client.next()).toMatchObject({
      type: "response",
      requestId,
      ok: true,
    });
    expect(await client.next()).toMatchObject({
      type: "subscription_end",
      requestId,
      reason: "unsubscribed",
    });
    expect(context.cleanups).toBe(1);
    expect(context.listeners.size).toBe(0);
    await server.stop();
    expect(context.cleanups).toBe(1);
    expect(context.disposed).toBe(false);
    expect(plugin.add(3)).toBe(5);
  });

  it("should isolate client subscriptions and allow setup without a return value", async () => {
    const { plugin, context } = counterPlugin();
    const server = createDaemonServer({
      daemon: { plugins: { counter: plugin } },
      port: 0,
    });
    servers.push(server);
    await server.start();
    const first = await connectSocket(server.url);
    const second = await connectSocket(server.url);
    const requestId = crypto.randomUUID();
    for (const client of [first, second]) {
      client.send({
        type: "subscribe",
        requestId,
        channel: "counter.watch",
        arguments: {},
      });
      await client.next();
      await client.next();
    }
    first.socket.close();
    await first.closed;
    second.send({
      type: "command",
      requestId: crypto.randomUUID(),
      command: "counter.add",
      arguments: { value: 8 },
    });
    expect(await second.next()).toMatchObject({
      type: "counter.updated",
      requestId,
      data: 8,
    });
    expect(await second.next()).toMatchObject({
      type: "response",
      ok: true,
      data: 8,
    });
    const emptyId = crypto.randomUUID();
    second.send({
      type: "subscribe",
      requestId: emptyId,
      channel: "counter.empty",
      arguments: {},
    });
    expect(await second.next()).toMatchObject({
      type: "response",
      requestId: emptyId,
      ok: true,
    });
    second.send({ type: "unsubscribe", requestId: emptyId });
    await second.next();
    expect(await second.next()).toMatchObject({
      type: "subscription_end",
      requestId: emptyId,
    });
    await server.stop();
    expect(context.cleanups).toBe(2);
  });

  it("should deliver buffered setup events before a single terminal message", async () => {
    const { plugin, context } = counterPlugin();
    const server = createDaemonServer({
      daemon: { plugins: { counter: plugin } },
      port: 0,
    });
    servers.push(server);
    await server.start();
    const client = await connectSocket(server.url);
    const requestId = crypto.randomUUID();
    client.send({
      type: "subscribe",
      requestId,
      channel: "counter.complete",
      arguments: {},
    });
    expect(await client.next()).toMatchObject({ type: "response", ok: true });
    expect(await client.next()).toMatchObject({
      type: "counter.updated",
      data: 1,
    });
    expect(await client.next()).toMatchObject({
      type: "subscription_end",
      reason: "completed",
    });
    expect(context.cleanups).toBe(1);
    client.send({
      type: "subscribe",
      requestId: crypto.randomUUID(),
      channel: "counter.invalid",
      arguments: {},
    });
    expect(await client.next()).toMatchObject({ type: "response", ok: true });
    expect(await client.next()).toMatchObject({
      type: "subscription_end",
      reason: "failed",
      error: { code: "INVALID_OUTPUT" },
    });
  });

  it("should reject invalid UUIDs and arguments before invoking plugin code", async () => {
    const { plugin, context } = counterPlugin();
    const server = createDaemonServer({
      daemon: { plugins: { counter: plugin } },
      port: 0,
    });
    servers.push(server);
    await server.start();
    for (const request of [
      {
        type: "command",
        requestId: "not-a-uuid",
        command: "counter.add",
        arguments: { value: 1 },
      },
      {
        type: "command",
        requestId: crypto.randomUUID(),
        command: "counter.add",
        arguments: { value: "wrong" },
      },
      {
        type: "unsubscribe",
        requestId: crypto.randomUUID(),
        targetRequestId: crypto.randomUUID(),
      },
    ]) {
      const client = await connectSocket(server.url);
      client.send(request);
      expect((await client.closed).code).toBe(1008);
    }
    expect(context.count).toBe(0);
  });

  it("should reject duplicate bindings and accept plugins without server bindings", async () => {
    const { plugin } = counterPlugin();
    expect(() =>
      createDaemonServer({
        daemon: { plugins: { first: plugin, second: plugin } },
      }),
    ).toThrow("duplicate command");
    const plain = createPlugin({ name: "plain", async cleanup() {} });
    const server = createDaemonServer({
      daemon: { plugins: { plain } },
      port: 0,
    });
    servers.push(server);
    await server.start();
    const client = await connectSocket(server.url);
    client.send({
      type: "command",
      requestId: crypto.randomUUID(),
      command: "missing",
      arguments: {},
    });
    expect(await client.next()).toMatchObject({
      type: "response",
      ok: false,
      error: { code: "UNKNOWN_BINDING" },
    });
  });
});
