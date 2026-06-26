import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { Text } from "ink";
import { render } from "ink-testing-library";
import type React from "react";

import { useWebSocket } from "./useWebSocket";
import type { WebSocketState } from "./useWebSocket.types";

/**
 * Minimal WebSocket double allowing tests to drive lifecycle events
 * (open/message/close/error) deterministically and inspect outbound `send`
 * calls. Each constructed instance is captured into `instances`.
 */
class FakeWebSocket {
  static instances: FakeWebSocket[] = [];
  static constructionError: Error | null = null;
  static CONNECTING = 0;
  static OPEN = 1;
  static CLOSING = 2;
  static CLOSED = 3;

  readyState = FakeWebSocket.CONNECTING;
  sent: string[] = [];
  url: string;
  private listeners: Record<string, Array<(event: unknown) => void>> = {};

  constructor(url: string) {
    if (FakeWebSocket.constructionError) {
      throw FakeWebSocket.constructionError;
    }
    this.url = url;
    FakeWebSocket.instances.push(this);
  }

  addEventListener(type: string, listener: (event: unknown) => void): void {
    if (!this.listeners[type]) this.listeners[type] = [];
    this.listeners[type].push(listener);
  }

  send(data: string): void {
    if (this.readyState !== FakeWebSocket.OPEN) {
      throw new Error("FakeWebSocket: send called while not OPEN");
    }
    this.sent.push(data);
  }

  close(): void {
    this.readyState = FakeWebSocket.CLOSED;
    this.dispatch("close", {});
  }

  /** Test helper: simulate the underlying socket reaching OPEN. */
  triggerOpen(): void {
    this.readyState = FakeWebSocket.OPEN;
    this.dispatch("open", {});
  }

  /** Test helper: simulate a connection dropping remotely. */
  triggerClose(): void {
    this.readyState = FakeWebSocket.CLOSED;
    this.dispatch("close", {});
  }

  private dispatch(type: string, event: unknown): void {
    for (const listener of this.listeners[type] ?? []) {
      listener(event);
    }
  }
}

const realWebSocket = (globalThis as { WebSocket?: unknown }).WebSocket;
const mountedHooks: ReturnType<typeof render>[] = [];

beforeEach(() => {
  FakeWebSocket.instances = [];
  FakeWebSocket.constructionError = null;
  (globalThis as { WebSocket: unknown }).WebSocket = FakeWebSocket;
});

afterEach(() => {
  for (const mountedHook of mountedHooks.splice(0)) {
    mountedHook.unmount();
  }
  (globalThis as { WebSocket?: unknown }).WebSocket = realWebSocket;
});

function renderHookHarness(element: React.ReactElement): void {
  mountedHooks.push(render(element));
}

async function waitFor(
  predicate: () => boolean,
  timeoutMs = 250,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!predicate()) {
    if (Date.now() >= deadline) {
      throw new Error(`Condition was not met within ${timeoutMs}ms`);
    }
    await Bun.sleep(1);
  }
}

/**
 * Capture the latest hook state into a ref-like holder so tests can call
 * `state.send(...)` from outside the React tree.
 */
function HookHarness({
  url,
  capture,
  reconnectDelayMs,
  connectionTimeoutMs,
  onError,
}: {
  url: string;
  capture: { current: WebSocketState | null };
  reconnectDelayMs?: number;
  connectionTimeoutMs?: number;
  onError?: (error: string) => void;
}) {
  const state = useWebSocket({
    url,
    reconnectDelayMs,
    connectionTimeoutMs,
    onMessage: () => {},
    onError,
  });
  capture.current = state;
  return <Text>ws</Text>;
}

describe("useWebSocket", () => {
  it("queues messages sent while the socket is CONNECTING and flushes on open", async () => {
    const capture: { current: WebSocketState | null } = { current: null };

    renderHookHarness(<HookHarness url="ws://test/ws" capture={capture} />);

    const socket = FakeWebSocket.instances[0]!;
    expect(socket.readyState).toBe(FakeWebSocket.CONNECTING);

    // Submitting a message before OPEN must report success (queued).
    const ok = capture.current?.send("first-message");
    expect(ok).toBe(true);
    expect(socket.sent).toEqual([]);

    // When the socket opens, the queue is drained in order.
    socket.triggerOpen();
    await Bun.sleep(0);
    expect(socket.sent).toEqual(["first-message"]);
  });

  it("sends directly once the socket is OPEN", async () => {
    const capture: { current: WebSocketState | null } = { current: null };

    renderHookHarness(<HookHarness url="ws://test/ws" capture={capture} />);

    const socket = FakeWebSocket.instances[0]!;
    socket.triggerOpen();
    await Bun.sleep(0);

    const ok = capture.current?.send("live");
    expect(ok).toBe(true);
    expect(socket.sent).toEqual(["live"]);
  });

  it("reconnects after the connection drops", async () => {
    const capture: { current: WebSocketState | null } = { current: null };

    renderHookHarness(
      <HookHarness url="ws://test/ws" reconnectDelayMs={5} capture={capture} />,
    );

    const firstSocket = FakeWebSocket.instances[0]!;
    firstSocket.triggerOpen();
    firstSocket.triggerClose();

    await waitFor(() => FakeWebSocket.instances.length === 2);
    expect(FakeWebSocket.instances).toHaveLength(2);

    const secondSocket = FakeWebSocket.instances[1]!;
    capture.current?.send("while-reconnecting");
    secondSocket.triggerOpen();

    await waitFor(() => capture.current?.status === "connected");
    expect(capture.current?.status).toBe("connected");
    expect(secondSocket.sent).toEqual(["while-reconnecting"]);
  });

  it("does not reconnect after being closed manually", async () => {
    const capture: { current: WebSocketState | null } = { current: null };

    renderHookHarness(
      <HookHarness url="ws://test/ws" reconnectDelayMs={5} capture={capture} />,
    );

    capture.current?.close();
    await Bun.sleep(10);

    expect(capture.current?.status).toBe("disconnected");
    expect(FakeWebSocket.instances).toHaveLength(1);
  });

  it("reports a connection timeout when the socket never opens", async () => {
    const capture: { current: WebSocketState | null } = { current: null };
    const errors: string[] = [];

    renderHookHarness(
      <HookHarness
        url="ws://test/ws"
        capture={capture}
        connectionTimeoutMs={5}
        reconnectDelayMs={10_000}
        onError={(error) => errors.push(error)}
      />,
    );
    await waitFor(
      () => errors.length === 1 && capture.current?.status === "disconnected",
    );

    expect(errors).toEqual(["WebSocket connection timed out after 5ms"]);
    expect(FakeWebSocket.instances).toHaveLength(1);
    expect(capture.current?.status).toBe("disconnected");
  });

  it("reports a synchronous connection failure", async () => {
    const capture: { current: WebSocketState | null } = { current: null };
    const errors: string[] = [];
    FakeWebSocket.constructionError = new Error("invalid endpoint");

    renderHookHarness(
      <HookHarness
        url="invalid"
        capture={capture}
        reconnectDelayMs={100}
        onError={(error) => errors.push(error)}
      />,
    );

    await waitFor(() => capture.current?.status === "error");
    expect(errors).toEqual(["WebSocket connection failed: invalid endpoint"]);
    expect(FakeWebSocket.instances).toHaveLength(0);
    expect(capture.current?.status).toBe("error");
  });
});
