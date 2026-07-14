import { describe, expect, it } from "bun:test";
import { createHubManager } from "@comma-agents/core/hub";
import type { ServerWebSocket } from "bun";
import { createDaemonState } from "../../../daemon-state";
import type { Logger } from "../../../logger";
import type { RunSystem } from "../../../run-system";
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
  const state = createDaemonState();
  const clients = new Map<string, ServerWebSocket<WsData>>();
  const logger = createTestLogger();
  const dispatcher = createDispatcher({
    state,
    clients,
    logger,
    hubManager: createHubManager(),
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

  it("routes a valid request and replies through the dispatcher", async () => {
    const { clients, dispatcher } = createTestDispatcher();
    const client = createTestSocket();
    clients.set("client-1", client.socket);
    const handleMessage = dispatcher.createMessageHandler({} as RunSystem);

    await handleMessage(
      "client-1",
      JSON.stringify({ type: "ping", requestId: "request-1" }),
    );

    expect(parseMessage(client.messages)).toMatchObject({
      type: "pong",
      requestId: "request-1",
    });
  });

  it("returns parse and validation errors with available correlation", async () => {
    const { clients, dispatcher } = createTestDispatcher();
    const client = createTestSocket();
    clients.set("client-1", client.socket);
    const handleMessage = dispatcher.createMessageHandler({} as RunSystem);

    await handleMessage("client-1", "not-json");
    await handleMessage(
      "client-1",
      JSON.stringify({ type: "unknown", requestId: "request-2" }),
    );

    expect(parseMessage(client.messages, 0)).toMatchObject({
      type: "error",
      code: "PARSE_ERROR",
    });
    expect(parseMessage(client.messages, 1)).toMatchObject({
      type: "error",
      code: "VALIDATION_ERROR",
      requestId: "request-2",
    });
  });

  it("returns handler failures to the requesting client", async () => {
    const { clients, dispatcher } = createTestDispatcher();
    const client = createTestSocket();
    clients.set("client-1", client.socket);
    const handleMessage = dispatcher.createMessageHandler({
      startRun() {
        throw new Error("run unavailable");
      },
    } as unknown as RunSystem);

    await handleMessage(
      "client-1",
      JSON.stringify({
        type: "start_run",
        runId: "run-1",
        requestId: "request-3",
      }),
    );

    expect(parseMessage(client.messages)).toMatchObject({
      type: "error",
      code: "START_FAILED",
      message: "run unavailable",
      requestId: "request-3",
    });
  });
});
