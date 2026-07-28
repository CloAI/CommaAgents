import { describe, expect, it } from "bun:test";
import type { ServerWebSocket } from "bun";
import { createDaemonStore } from "../../../daemon-store";
import type { Logger } from "../../../logger";
import type { WsData } from "../../server.types";
import { createDispatcher } from "./dispatcher";

interface TestSocket {
  readonly messages: string[];
  readonly socket: ServerWebSocket<WsData>;
}

function createTestSocket(throwOnSend = false): TestSocket {
  const messages: string[] = [];
  return {
    messages,
    socket: {
      send(message: string) {
        if (throwOnSend) throw new Error("disconnected");
        messages.push(message);
      },
    } as unknown as ServerWebSocket<WsData>,
  };
}

function createTestLogger(): Logger & { readonly debugMessages: string[] } {
  const debugMessages: string[] = [];
  return {
    debugMessages,
    debug(message) {
      debugMessages.push(message);
    },
    info() {},
    warn() {},
    error() {},
    child() {
      return this;
    },
    flush() {},
    close() {},
  };
}

function createTestDispatcher() {
  const state = createDaemonStore();
  const clients = new Map<string, ServerWebSocket<WsData>>();
  const logger = createTestLogger();
  const dispatcher = createDispatcher({
    daemonStore: state,
    clients,
    logger,
  });
  return { state, clients, logger, dispatcher };
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
    state.createRun("/strategy.json", "Test", "/workspace", "run-1");
    state.subscribe("subscribed", "run-1");

    dispatcher.broadcast("run-1", {
      type: "pong",
      ts: "2026-01-01T00:00:00.000Z",
    });

    expect(subscribedClient.messages).toHaveLength(1);
    expect(otherClient.messages).toHaveLength(0);
  });

  it("logs missing clients and send failures without throwing", () => {
    const { clients, logger, dispatcher } = createTestDispatcher();
    clients.set("disconnected", createTestSocket(true).socket);

    dispatcher.send("missing", {
      type: "pong",
      ts: "2026-01-01T00:00:00.000Z",
    });
    dispatcher.send("disconnected", {
      type: "pong",
      ts: "2026-01-01T00:00:00.000Z",
    });

    expect(logger.debugMessages).toContain("send: client missing not found");
    expect(logger.debugMessages).toContain(
      "Failed to send to client disconnected",
    );
  });
});
