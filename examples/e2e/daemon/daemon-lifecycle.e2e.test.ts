// E2E: Daemon lifecycle — server start/stop, WebSocket connections,
// health endpoint, protocol basics (ping/pong, invalid messages).
//
// These tests exercise the full daemon server with real Bun WebSocket
// connections and mock AI models. They complement the unit-level tests
// in server.test.ts by focusing on higher-level lifecycle scenarios.

import { afterAll, afterEach, describe, expect, it } from "bun:test";
import { resetGlobalDefaults, resetModelRegistry } from "@comma-agents/core";

import {
  cleanupTempFiles,
  connectTestClient,
  settle,
  startTestDaemon,
  stopAllDaemons,
} from "./helpers/ws-client";

// Lifecycle

afterEach(async () => {
  await cleanupTempFiles();
  resetModelRegistry();
  resetGlobalDefaults();
});

afterAll(async () => {
  await stopAllDaemons();
});

// ===========================================================================
// Tests
// ===========================================================================

describe("E2E: Daemon Lifecycle", () => {
  // -----------------------------------------------------------------------
  // 1. Server start and stop
  // -----------------------------------------------------------------------

  describe("server start/stop", () => {
    it("should start on a random port and report a valid URL", async () => {
      const daemon = await startTestDaemon();
      expect(daemon.port).toBeGreaterThan(0);
      expect(daemon.url).toContain(`ws://127.0.0.1:${daemon.port}/ws`);
    });

    it("should respond to health check after start", async () => {
      const daemon = await startTestDaemon();
      const res = await fetch(`http://127.0.0.1:${daemon.port}/health`);
      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.status).toBe("ok");
      expect(typeof body.uptime).toBe("number");
      expect(body.activeRuns).toBe(0);
      expect(typeof body.connectedClients).toBe("number");
    });

    it("should stop gracefully and refuse new connections", async () => {
      const daemon = await startTestDaemon();
      const port = daemon.port;
      await daemon.stop();

      // After stop, the port should be released
      // Attempting to fetch health should fail
      let threw = false;
      try {
        await fetch(`http://127.0.0.1:${port}/health`);
      } catch {
        threw = true;
      }
      expect(threw).toBe(true);
    });

    it("should stop idempotently (no error on double stop)", async () => {
      const daemon = await startTestDaemon();
      await daemon.stop();
      // Second stop should not throw
      await daemon.stop();
    });
  });

  // -----------------------------------------------------------------------
  // 2. WebSocket connections
  // -----------------------------------------------------------------------

  describe("WebSocket connections", () => {
    it("should accept a single client connection", async () => {
      const daemon = await startTestDaemon();
      const client = await connectTestClient(daemon);
      expect(client.ws.readyState).toBe(WebSocket.OPEN);
      client.close();
    });

    it("should accept multiple simultaneous clients", async () => {
      const daemon = await startTestDaemon();
      const c1 = await connectTestClient(daemon);
      const c2 = await connectTestClient(daemon);
      const c3 = await connectTestClient(daemon);

      expect(c1.ws.readyState).toBe(WebSocket.OPEN);
      expect(c2.ws.readyState).toBe(WebSocket.OPEN);
      expect(c3.ws.readyState).toBe(WebSocket.OPEN);

      c1.close();
      c2.close();
      c3.close();
    });

    it("should track connected clients in health endpoint", async () => {
      const daemon = await startTestDaemon();
      const c1 = await connectTestClient(daemon);
      const c2 = await connectTestClient(daemon);
      await settle();

      const res1 = await fetch(`http://127.0.0.1:${daemon.port}/health`);
      const body1 = await res1.json();
      expect(body1.connectedClients).toBe(2);

      c1.close();
      await settle(100);

      const res2 = await fetch(`http://127.0.0.1:${daemon.port}/health`);
      const body2 = await res2.json();
      expect(body2.connectedClients).toBe(1);

      c2.close();
    });

    it("should handle client disconnect without crashing", async () => {
      const daemon = await startTestDaemon();
      const client = await connectTestClient(daemon);
      client.close();
      await settle(100);

      // Daemon should still be running
      expect(daemon.port).toBeGreaterThan(0);

      // Should still accept new connections
      const c2 = await connectTestClient(daemon);
      expect(c2.ws.readyState).toBe(WebSocket.OPEN);
      c2.close();
    });
  });

  // -----------------------------------------------------------------------
  // 3. Ping/pong protocol
  // -----------------------------------------------------------------------

  describe("ping/pong", () => {
    it("should respond to ping with pong containing timestamp", async () => {
      const daemon = await startTestDaemon();
      const client = await connectTestClient(daemon);

      client.send({ type: "ping" });
      const pong: any = await client.waitForType("pong");

      expect(pong.type).toBe("pong");
      expect(typeof pong.ts).toBe("string");
      // Verify ts is a valid ISO datetime
      expect(Number.isNaN(Date.parse(pong.ts))).toBe(false);

      client.close();
    });

    it("should echo requestId in pong", async () => {
      const daemon = await startTestDaemon();
      const client = await connectTestClient(daemon);

      client.send({ type: "ping", requestId: "ping-123" });
      const pong: any = await client.waitForType("pong");

      expect(pong.requestId).toBe("ping-123");
      client.close();
    });

    it("should handle rapid-fire pings", async () => {
      const daemon = await startTestDaemon();
      const client = await connectTestClient(daemon);

      client.send({ type: "ping", requestId: "p1" });
      client.send({ type: "ping", requestId: "p2" });
      client.send({ type: "ping", requestId: "p3" });

      // All three pongs should arrive
      const pongs = await client.waitForN(
        3,
        (m: any) => m?.type === "pong",
        5000,
      );

      expect(pongs.length).toBe(3);
      const requestIds = pongs.map((p: any) => p.requestId);
      expect(requestIds).toContain("p1");
      expect(requestIds).toContain("p2");
      expect(requestIds).toContain("p3");

      client.close();
    });
  });

  // -----------------------------------------------------------------------
  // 4. Invalid messages
  // -----------------------------------------------------------------------

  describe("invalid messages", () => {
    it("should respond with PARSE_ERROR for non-JSON text", async () => {
      const daemon = await startTestDaemon();
      const client = await connectTestClient(daemon);

      client.ws.send("this is not json{{{");
      const err: any = await client.waitForType("error");

      expect(err.code).toBe("PARSE_ERROR");
      expect(err.message).toContain("Invalid JSON");
      client.close();
    });

    it("should respond with VALIDATION_ERROR for invalid schema", async () => {
      const daemon = await startTestDaemon();
      const client = await connectTestClient(daemon);

      // Missing required strategyPath
      client.send({ type: "start_strategy" });
      const err: any = await client.waitForType("error");

      expect(err.code).toBe("VALIDATION_ERROR");
      client.close();
    });

    it("should respond with VALIDATION_ERROR for unknown message type", async () => {
      const daemon = await startTestDaemon();
      const client = await connectTestClient(daemon);

      client.send({ type: "totally_unknown_type" });
      const err: any = await client.waitForType("error");

      expect(err.code).toBe("VALIDATION_ERROR");
      client.close();
    });

    it("should respond with PARSE_ERROR for binary data", async () => {
      const daemon = await startTestDaemon();
      const client = await connectTestClient(daemon);

      client.ws.send(new Uint8Array([0x00, 0x01, 0x02]));
      const err: any = await client.waitForType("error");

      expect(err.code).toBe("PARSE_ERROR");
      client.close();
    });
  });

  // -----------------------------------------------------------------------
  // 5. HTTP routing
  // -----------------------------------------------------------------------

  describe("HTTP routing", () => {
    it("should return 400 for non-upgrade request to /ws", async () => {
      const daemon = await startTestDaemon();
      const res = await fetch(`http://127.0.0.1:${daemon.port}/ws`);
      expect(res.status).toBe(400);
    });

    it("should return 404 for unknown paths", async () => {
      const daemon = await startTestDaemon();
      const res = await fetch(`http://127.0.0.1:${daemon.port}/unknown`);
      expect(res.status).toBe(404);
    });
  });

  // -----------------------------------------------------------------------
  // 6. list_strategies when idle
  // -----------------------------------------------------------------------

  describe("list_strategies", () => {
    it("should return empty runs when no flows are active", async () => {
      const daemon = await startTestDaemon();
      const client = await connectTestClient(daemon);

      client.send({ type: "list_strategies", requestId: "list-idle" });
      const list: any = await client.waitForType("strategy_list");

      expect(list.type).toBe("strategy_list");
      expect(list.runs).toEqual([]);
      expect(list.requestId).toBe("list-idle");

      client.close();
    });
  });
});
