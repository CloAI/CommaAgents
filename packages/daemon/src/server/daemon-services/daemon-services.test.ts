import { describe, expect, it } from "bun:test";
import type { DaemonMessage } from "../protocol/messages";
import {
  createDaemonServiceRegistry,
  defineDaemonRoute,
} from "./daemon-services";

function createRegistry(
  routes: Parameters<
    typeof createDaemonServiceRegistry
  >[0]["services"][number]["routes"],
) {
  const messages: DaemonMessage[] = [];
  const registry = createDaemonServiceRegistry({
    services: [{ name: "test", routes }],
    messageSender: {
      send(_clientId, message): void {
        messages.push(message);
      },
      broadcast(): void {},
    },
  });
  return { messages, registry };
}

describe("createDaemonServiceRegistry", () => {
  it("should route a validated request and preserve response typing", async () => {
    const { registry, messages } = createRegistry([
      defineDaemonRoute("ping", (message, context) => {
        context.reply({
          type: "pong",
          ts: "2026-01-01T00:00:00.000Z",
          requestId: message.requestId,
        });
      }),
    ]);

    await registry.handleMessage(
      "client-1",
      JSON.stringify({ type: "ping", requestId: "request-1" }),
    );

    expect(messages).toEqual([
      {
        type: "pong",
        ts: "2026-01-01T00:00:00.000Z",
        requestId: "request-1",
      },
    ]);
  });

  it("should reject duplicate routes during construction", () => {
    const route = defineDaemonRoute("ping", () => {});

    expect(() =>
      createDaemonServiceRegistry({
        services: [
          { name: "first", routes: [route] },
          { name: "second", routes: [route] },
        ],
        messageSender: { send(): void {}, broadcast(): void {} },
      }),
    ).toThrow("Duplicate daemon route: ping");
  });

  it("should return parse and validation errors with correlation", async () => {
    const { registry, messages } = createRegistry([]);

    await registry.handleMessage("client-1", "not-json");
    await registry.handleMessage(
      "client-1",
      JSON.stringify({ type: "unknown", requestId: "request-2" }),
    );

    expect(messages).toMatchObject([
      { type: "error", code: "PARSE_ERROR" },
      {
        type: "error",
        code: "VALIDATION_ERROR",
        requestId: "request-2",
      },
    ]);
  });

  it("should isolate route failures as protocol errors", async () => {
    const { registry, messages } = createRegistry([
      defineDaemonRoute("ping", () => {
        throw new Error("route failed");
      }),
    ]);

    await registry.handleMessage(
      "client-1",
      JSON.stringify({ type: "ping", requestId: "request-3" }),
    );

    expect(messages).toMatchObject([
      {
        type: "error",
        code: "INTERNAL_ERROR",
        message: "route failed",
        requestId: "request-3",
      },
    ]);
  });
});
