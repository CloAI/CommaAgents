import { describe, expect, it, vi } from "vitest";
import type { WebSocket } from "uWebSockets.js";
import { createDaemonStore } from "../../daemon-store";
import { getLogger } from "@logtape/logtape";
import type { WsData } from "../../createDaemon.types";
import { createDispatcher } from "./dispatcher";

interface TestSocket {
  readonly messages: string[];
  readonly socket: WebSocket<WsData>;
}

function createTestSocket(throwOnSend = false): TestSocket {
  const messages: string[] = [];
  return {
    messages,
    socket: {
      getBufferedAmount() { return 0; },
      end() {},
      send(message: string) {
        if (throwOnSend) {
          throw new Error("disconnected");
        }
        messages.push(message);
        return 1;
      },
    } as unknown as WebSocket<WsData>,
  };
}

function createTestDispatcher() {
  const state = createDaemonStore();
  const clients = new Map<string, WebSocket<WsData>>();
  const dispatcher = createDispatcher({
    daemonStore: state,
    clients,
  });
  return { state, clients, dispatcher };
}

function parseMessage(messages: readonly string[], index = 0) {
  return JSON.parse(messages[index] ?? "null") as Record<string, unknown>;
}

describe("createDispatcher", () => {
  it("sends direct messages to one client", () => {
    const { clients, dispatcher } = createTestDispatcher();
    const client = createTestSocket();
    clients.set("client-1", client.socket);

    dispatcher.send("client-1", {
      type: "pong",
      ts: "2026-01-01T00:00:00.000Z",
    });

    expect(parseMessage(client.messages)).toMatchObject({ type: "pong" });
  });

  it("broadcasts only to clients subscribed to the run", () => {
    const { state, clients, dispatcher } = createTestDispatcher();
    const subscribedClient = createTestSocket();
    const otherClient = createTestSocket();
    clients.set("subscribed", subscribedClient.socket);
    clients.set("other", otherClient.socket);
    state.addClient("subscribed");
    state.addClient("other");
    const runStore = state.createRun(
      "/strategy.json",
      "Test",
      "/workspace",
      "run-1",
    );
    runStore.addSubscriber("subscribed");

    dispatcher.broadcast("run-1", {
      type: "pong",
      ts: "2026-01-01T00:00:00.000Z",
    });

    expect(subscribedClient.messages).toHaveLength(1);
    expect(otherClient.messages).toHaveLength(0);
  });

  it("logs missing clients and send failures without throwing", () => {
    const { clients, dispatcher } = createTestDispatcher();
    const debug = vi.spyOn(
      getLogger(["comma", "daemon", "dispatcher"]),
      "debug",
    ).mockReturnValue(undefined);
    try {
      clients.set("disconnected", createTestSocket(true).socket);

      dispatcher.send("missing", {
        type: "pong",
        ts: "2026-01-01T00:00:00.000Z",
      });
      dispatcher.send("disconnected", {
        type: "pong",
        ts: "2026-01-01T00:00:00.000Z",
      });

      expect(debug).toHaveBeenCalledWith("send: client missing not found");
      expect(debug).toHaveBeenCalledWith(
        "Failed to send to client disconnected",
      );
    } finally {
      debug.mockRestore();
    }
  });
});
