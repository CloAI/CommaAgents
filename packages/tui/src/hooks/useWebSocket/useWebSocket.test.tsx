// Enable React act() environment for bun:test
(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;

// Suppress React act() warnings from ink-testing-library's internal renders
const originalConsoleError = console.error;
console.error = (...args: unknown[]) => {
  if (typeof args[0] === "string" && args[0].includes("was not wrapped in act")) return;
  originalConsoleError(...args);
};

import React, { act } from "react";
import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test";
import { render } from "ink-testing-library";
import { Text } from "ink";

import { useWebSocket } from "./useWebSocket";
import type { WebSocketState } from "./useWebSocket.types";

/**
 * Minimal WebSocket double allowing tests to drive lifecycle events
 * (open/message/close/error) deterministically and inspect outbound `send`
 * calls. Each constructed instance is captured into `instances`.
 */
class FakeWebSocket {
  static instances: FakeWebSocket[] = [];
  static CONNECTING = 0;
  static OPEN = 1;
  static CLOSING = 2;
  static CLOSED = 3;

  readyState = FakeWebSocket.CONNECTING;
  sent: string[] = [];
  url: string;
  private listeners: Record<string, Array<(event: unknown) => void>> = {};

  constructor(url: string) {
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

  private dispatch(type: string, event: unknown): void {
    for (const listener of this.listeners[type] ?? []) {
      listener(event);
    }
  }
}

const realWebSocket = (globalThis as { WebSocket?: unknown }).WebSocket;

beforeEach(() => {
  FakeWebSocket.instances = [];
  (globalThis as { WebSocket: unknown }).WebSocket = FakeWebSocket;
});

afterEach(() => {
  (globalThis as { WebSocket?: unknown }).WebSocket = realWebSocket;
});

/**
 * Capture the latest hook state into a ref-like holder so tests can call
 * `state.send(...)` from outside the React tree.
 */
function HookHarness({ url, capture }: { url: string; capture: { current: WebSocketState | null } }) {
  const state = useWebSocket({ url, onMessage: () => {} });
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
    const ok = capture.current!.send("first-message");
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

    const ok = capture.current!.send("live");
    expect(ok).toBe(true);
    expect(socket.sent).toEqual(["live"]);
  });
});
