import { describe, expect, it, vi } from "vitest";
import type { DesktopBridge, OpenResult } from "../shared/ipc";
import { createIpcSocket } from "./ipc-socket";

type DaemonBridge = DesktopBridge["daemon"];

function fakeDaemon(result: OpenResult) {
  const listeners = {
    message: new Set<Parameters<DaemonBridge["onMessage"]>[0]>(),
    closed: new Set<Parameters<DaemonBridge["onClosed"]>[0]>(),
  };
  const daemon: DaemonBridge = {
    open: vi.fn(async () => result),
    send: vi.fn(),
    close: vi.fn(),
    onMessage(listener) {
      listeners.message.add(listener);
      return () => listeners.message.delete(listener);
    },
    onClosed(listener) {
      listeners.closed.add(listener);
      return () => listeners.closed.delete(listener);
    },
  };
  return { daemon, listeners };
}

const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

describe("createIpcSocket", () => {
  it("opens, sends, and delivers messages for its own connection only", async () => {
    const { daemon, listeners } = fakeDaemon({ ok: true, id: 7 });
    const socket = createIpcSocket(daemon);
    const onopen = vi.fn();
    const onmessage = vi.fn();
    socket.onopen = onopen;
    socket.onmessage = onmessage;
    expect(socket.readyState).toBe(0);
    await settle();

    expect(socket.readyState).toBe(1);
    expect(onopen).toHaveBeenCalledOnce();
    socket.send("hello");
    expect(daemon.send).toHaveBeenCalledWith(7, "hello");

    for (const listener of listeners.message) {
      listener({ id: 8, text: "other" });
      listener({ id: 7, text: "mine" });
    }
    expect(onmessage).toHaveBeenCalledOnce();
    expect(onmessage).toHaveBeenCalledWith({ data: "mine" });
  });

  it("closes with the daemon's reason when startup failed", async () => {
    const { daemon } = fakeDaemon({ ok: false, reason: "Standalone daemon" });
    const socket = createIpcSocket(daemon);
    const onclose = vi.fn();
    socket.onclose = onclose;
    await settle();

    expect(socket.readyState).toBe(3);
    expect(onclose).toHaveBeenCalledWith({
      code: 1011,
      reason: "Standalone daemon",
    });
    expect(() => socket.send("late")).toThrow();
  });

  it("releases listeners and the connection when closed locally", async () => {
    const { daemon, listeners } = fakeDaemon({ ok: true, id: 3 });
    const socket = createIpcSocket(daemon);
    await settle();
    socket.close();

    expect(daemon.close).toHaveBeenCalledWith(3);
    expect(listeners.message.size).toBe(0);
    expect(listeners.closed.size).toBe(0);
  });

  it("hands a connection back when closed while still connecting", async () => {
    const { daemon } = fakeDaemon({ ok: true, id: 5 });
    const socket = createIpcSocket(daemon);
    socket.close();
    await settle();

    expect(daemon.close).toHaveBeenCalledWith(5);
  });
});
