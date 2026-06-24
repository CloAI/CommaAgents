// Enable React act() environment for bun:test
(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;

// Suppress React act() warnings from ink-testing-library's internal renders
const originalConsoleError = console.error;
console.error = (...args: unknown[]) => {
  if (typeof args[0] === "string" && args[0].includes("was not wrapped in act"))
    return;
  originalConsoleError(...args);
};

import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { Text } from "ink";
import { render } from "ink-testing-library";
import { act } from "react";

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

beforeEach(() => {
  FakeWebSocket.instances = [];
  FakeWebSocket.constructionError = null;
  (globalThis as { WebSocket: unknown }).WebSocket = FakeWebSocket;
});

afterEach(() => {
  (globalThis as { WebSocket?: unknown }).WebSocket = realWebSocket;
});

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

    await act(async () => {
      render(<HookHarness url="ws://test/ws" capture={capture} />);
    });

    const socket = FakeWebSocket.instances[0]!;
    expect(socket.readyState).toBe(FakeWebSocket.CONNECTING);

    // Submitting a message before OPEN must report success (queued).
    const ok = capture.current?.send("first-message");
    expect(ok).toBe(true);
    expect(socket.sent).toEqual([]);

    // When the socket opens, the queue is drained in order.
    await act(async () => {
      socket.triggerOpen();
    });
    expect(socket.sent).toEqual(["first-message"]);
  });

  it("sends directly once the socket is OPEN", async () => {
    const capture: { current: WebSocketState | null } = { current: null };

    await act(async () => {
      render(<HookHarness url="ws://test/ws" capture={capture} />);
    });

    const socket = FakeWebSocket.instances[0]!;
    await act(async () => {
      socket.triggerOpen();
    });

    const ok = capture.current?.send("live");
    expect(ok).toBe(true);
    expect(socket.sent).toEqual(["live"]);
  });

  it("reconnects after the connection drops", async () => {
    const capture: { current: WebSocketState | null } = { current: null };

    await act(async () => {
      render(
        <HookHarness
          url="ws://test/ws"
          reconnectDelayMs={5}
          capture={capture}
        />,
      );
    });

    const firstSocket = FakeWebSocket.instances[0]!;
    await act(async () => {
      firstSocket.triggerOpen();
      firstSocket.triggerClose();
      await Bun.sleep(10);
    });

    expect(FakeWebSocket.instances).toHaveLength(2);
    expect(capture.current?.status).toBe("connecting");

    const secondSocket = FakeWebSocket.instances[1]!;
    capture.current?.send("while-reconnecting");
    await act(async () => {
      secondSocket.triggerOpen();
    });

    expect(capture.current?.status).toBe("connected");
    expect(secondSocket.sent).toEqual(["while-reconnecting"]);
  });

  it("does not reconnect after being closed manually", async () => {
    const capture: { current: WebSocketState | null } = { current: null };

    await act(async () => {
      render(
        <HookHarness
          url="ws://test/ws"
          reconnectDelayMs={5}
          capture={capture}
        />,
      );
    });

    await act(async () => {
      capture.current?.close();
      await Bun.sleep(10);
    });

    expect(capture.current?.status).toBe("disconnected");
    expect(FakeWebSocket.instances).toHaveLength(1);
  });

  it("reports a connection timeout when the socket never opens", async () => {
    const capture: { current: WebSocketState | null } = { current: null };
    const errors: string[] = [];

    await act(async () => {
      render(
        <HookHarness
          url="ws://test/ws"
          capture={capture}
          connectionTimeoutMs={5}
          reconnectDelayMs={100}
          onError={(error) => errors.push(error)}
        />,
      );
      await Bun.sleep(10);
    });

    expect(errors).toEqual(["WebSocket connection timed out after 5ms"]);
    expect(FakeWebSocket.instances).toHaveLength(1);
    expect(capture.current?.status).toBe("disconnected");
  });

  it("reports a synchronous connection failure", async () => {
    const capture: { current: WebSocketState | null } = { current: null };
    const errors: string[] = [];
    FakeWebSocket.constructionError = new Error("invalid endpoint");

    await act(async () => {
      render(
        <HookHarness
          url="invalid"
          capture={capture}
          reconnectDelayMs={100}
          onError={(error) => errors.push(error)}
        />,
      );
    });

    expect(errors).toEqual(["WebSocket connection failed: invalid endpoint"]);
    expect(FakeWebSocket.instances).toHaveLength(0);
    expect(capture.current?.status).toBe("error");
  });
});
