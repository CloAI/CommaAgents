import { EventEmitter } from "node:events";
import { createPlugin, defineCommand } from "@daemon-src/daemon-plugin";
import type { CommandContext, Plugin } from "@daemon-src/daemon-plugin";
import { describe, expect, it } from "vitest";
import { z } from "zod/v4";
import { IPC_CHANNELS } from "../shared/ipc";
import type { OpenResult } from "../shared/ipc";
import { createDaemonElectronIPC } from "./daemon-ipc";
import type { IpcHub, IpcSenderEvent } from "./daemon-ipc";

interface EchoPlugin extends Plugin<"echo"> {
  readonly name: "echo";
}

const echo = createPlugin<"echo", EchoPlugin, Record<string, never>>({
  name: "echo",
  context: {},
  async cleanup() {},
  server: {
    commands: [
      defineCommand({
        name: "echo.say",
        arguments: z.object({ text: z.string() }).strict(),
        output: z.string(),
        handle({
          arguments: { text },
        }: CommandContext<
          EchoPlugin,
          Record<string, never>,
          { text: string }
        >) {
          return text;
        },
      }),
    ],
  },
});

const TRUSTED = "app://trusted/";

/**
 * A window's web contents: records what the main process sends to it.
 * @returns {object} Event emitter with recorded sends.
 */
function fakeSender() {
  const emitter = new EventEmitter();
  const sent: Array<{ channel: string; payload: unknown }> = [];
  return Object.assign(emitter, {
    sent,
    isDestroyed: () => false,
    send: (channel: string, payload: unknown) =>
      void sent.push({ channel, payload }),
  });
}
type FakeSender = ReturnType<typeof fakeSender>;

/**
 * Just enough of `ipcMain` to register and invoke handlers.
 * @returns {object} Hub plus helpers that invoke registered handlers.
 */
function fakeIpcMain() {
  const handlers = new Map<
    string,
    (event: IpcSenderEvent) => Promise<OpenResult>
  >();
  const listeners = new Map<
    string,
    (event: IpcSenderEvent, ...args: unknown[]) => void
  >();
  const ipcMain: IpcHub = {
    handle: (channel, handler) => void handlers.set(channel, handler),
    on: (channel, listener) => listeners.set(channel, listener),
    removeHandler: (channel) => void handlers.delete(channel),
    removeAllListeners: (channel) => listeners.delete(channel),
  };
  const event = (sender: FakeSender, url = TRUSTED): IpcSenderEvent => ({
    sender,
    senderFrame: { url },
  });
  return {
    ipcMain,
    handlers,
    listeners,
    open: (sender: FakeSender, url?: string) =>
      handlers.get(IPC_CHANNELS.daemonOpen)!(event(sender, url)),
    send: (sender: FakeSender, id: number, text: string, url?: string) =>
      listeners.get(IPC_CHANNELS.daemonSend)?.(event(sender, url), id, text),
    close: (sender: FakeSender, id: number) =>
      listeners.get(IPC_CHANNELS.daemonClose)?.(event(sender), id),
  };
}

const request = (text: string) =>
  JSON.stringify({
    type: "command",
    requestId: crypto.randomUUID(),
    command: "echo.say",
    arguments: { text },
  });
const settle = () => new Promise((resolve) => setTimeout(resolve, 10));
const isTrusted = (url: string | undefined) => url === TRUSTED;
const kernel = Promise.resolve({ plugins: { echo } });

describe("createDaemonElectronIPC", () => {
  it("answers requests from the window that opened the connection", async () => {
    const hub = fakeIpcMain();
    createDaemonElectronIPC({ ipcMain: hub.ipcMain, kernel, isTrusted });
    const window = fakeSender();
    const opened = await hub.open(window);
    expect(opened.ok).toBe(true);
    if (!opened.ok) {
      return;
    }

    hub.send(window, opened.id, request("hello"));
    await settle();

    const reply = window.sent.find(
      (entry) => entry.channel === IPC_CHANNELS.daemonMessage,
    )!.payload as { id: number; text: string };
    expect(reply.id).toBe(opened.id);
    expect(JSON.parse(reply.text)).toMatchObject({ ok: true, data: "hello" });
  });

  it("ignores frames from another window", async () => {
    const hub = fakeIpcMain();
    createDaemonElectronIPC({ ipcMain: hub.ipcMain, kernel, isTrusted });
    const owner = fakeSender();
    const other = fakeSender();
    const opened = await hub.open(owner);
    if (!opened.ok) {
      throw new Error("expected an open connection");
    }

    hub.send(other, opened.id, request("hijack"));
    await settle();

    expect(owner.sent).toHaveLength(0);
    expect(other.sent).toHaveLength(0);
  });

  it("refuses senders that are not the application's page", async () => {
    const hub = fakeIpcMain();
    createDaemonElectronIPC({ ipcMain: hub.ipcMain, kernel, isTrusted });
    const window = fakeSender();

    expect(await hub.open(window, "https://evil.example/")).toEqual({
      ok: false,
      reason: "Untrusted sender",
    });
    const opened = await hub.open(window);
    if (!opened.ok) {
      throw new Error("expected an open connection");
    }
    hub.send(window, opened.id, request("x"), "https://evil.example/");
    await settle();
    expect(window.sent).toHaveLength(0);
  });

  it("reports a failed start as the reason to every opener", async () => {
    const hub = fakeIpcMain();
    createDaemonElectronIPC({
      ipcMain: hub.ipcMain,
      kernel: Promise.reject(new Error("Standalone daemon is running")),
      isTrusted,
    });

    expect(await hub.open(fakeSender())).toEqual({
      ok: false,
      reason: "Standalone daemon is running",
    });
  });

  it("drops a connection when its window is destroyed or it closes", async () => {
    const hub = fakeIpcMain();
    createDaemonElectronIPC({ ipcMain: hub.ipcMain, kernel, isTrusted });
    const gone = fakeSender();
    const closing = fakeSender();
    const first = await hub.open(gone);
    const second = await hub.open(closing);
    if (!first.ok || !second.ok) {
      throw new Error("expected open connections");
    }

    gone.emit("destroyed");
    hub.close(closing, second.id);
    hub.send(gone, first.id, request("a"));
    hub.send(closing, second.id, request("b"));
    await settle();

    expect(gone.sent).toHaveLength(0);
    expect(closing.sent).toHaveLength(0);
    expect(gone.listenerCount("destroyed")).toBe(0);
  });

  it("stops answering after stop()", async () => {
    const hub = fakeIpcMain();
    const server = createDaemonElectronIPC({
      ipcMain: hub.ipcMain,
      kernel,
      isTrusted,
    });
    await server.stop();

    expect(hub.handlers.size).toBe(0);
    expect(hub.listeners.size).toBe(0);
  });
});
