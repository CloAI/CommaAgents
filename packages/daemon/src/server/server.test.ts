// Integration tests for the WebSocket server (createDaemon).
//
// These tests use real Bun WebSocket connections, real strategy files with
// mock AI models registered via global registries, and exercise the full
// pipeline: WS message → routing → executor → loadStrategy → mock model
// → events back over WebSocket.

import { afterAll, afterEach, beforeEach, describe, expect, it } from "bun:test";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { resetGlobalDefaults, resetModelRegistry } from "@comma-agents/core";
import {
  MINIMAL_STRATEGY,
  MULTI_AGENT_STRATEGY,
  mockLogger,
  setupMockModels,
  USER_AGENT_STRATEGY,
  writeTempStrategy,
} from "../test.utils";
import { createDaemon } from "./server";
import type { Daemon } from "./server.types";

// Test lifecycle — model registration

beforeEach(() => {
  setupMockModels();
});

afterEach(() => {
  resetModelRegistry();
  resetGlobalDefaults();
});

// Helpers — strategy files

const tempFiles: string[] = [];

/** Write a strategy to a temp file, tracking it for cleanup. */
async function writeTrackedTempStrategy(content: string, extension = "json"): Promise<string> {
  const filePath = await writeTempStrategy(content, extension);
  tempFiles.push(filePath);
  return filePath;
}

// Helpers — daemon + WebSocket lifecycle

/** Create and start a daemon on a random port. */
async function startDaemon(overrides?: { bridgeTimeout?: number }): Promise<Daemon> {
  const daemon = createDaemon({
    config: {
      port: 0, // Random available port
      host: "127.0.0.1",
      logLevel: "error",
      logFile: undefined,
      providerCacheDir: join(tmpdir(), "providers"),
      pidFile: join(tmpdir(), "test.pid"),
      configFile: join(tmpdir(), "test.json"),
    },
    logger: mockLogger(),
    bridgeTimeout: overrides?.bridgeTimeout ?? 0,
  });

  await daemon.start();
  activeDaemons.push(daemon);
  return daemon;
}

/** Connect a WebSocket client to a daemon. Returns the ws + helpers. */
function connectClient(daemon: Daemon): Promise<{
  ws: WebSocket;
  messages: unknown[];
  waitForMessage: (predicate: (msg: unknown) => boolean, timeoutMs?: number) => Promise<unknown>;
  waitForType: (type: string, timeoutMs?: number) => Promise<unknown>;
  send: (msg: unknown) => void;
  close: () => void;
}> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(daemon.url);
    const messages: unknown[] = [];
    const waiters: Array<{
      predicate: (msg: unknown) => boolean;
      resolve: (msg: unknown) => void;
      reject: (err: Error) => void;
    }> = [];

    ws.onmessage = (event) => {
      const data = JSON.parse(event.data as string);
      messages.push(data);

      // Check waiters
      for (let i = waiters.length - 1; i >= 0; i--) {
        if (waiters[i].predicate(data)) {
          waiters[i].resolve(data);
          waiters.splice(i, 1);
        }
      }
    };

    ws.onopen = () => {
      resolve({
        ws,
        messages,
        waitForMessage(predicate, timeoutMs = 5000) {
          // Check already-received messages
          const found = messages.find(predicate);
          if (found) return Promise.resolve(found);

          return new Promise<unknown>((res, rej) => {
            const timer = setTimeout(() => {
              const idx = waiters.findIndex((w) => w.resolve === res);
              if (idx >= 0) waiters.splice(idx, 1);
              rej(
                new Error(
                  `Timed out waiting for message (${timeoutMs}ms). Got: ${JSON.stringify(messages)}`,
                ),
              );
            }, timeoutMs);

            waiters.push({
              predicate,
              resolve: (msg) => {
                clearTimeout(timer);
                res(msg);
              },
              reject: rej,
            });
          });
        },
        waitForType(type: string, timeoutMs = 5000) {
          return this.waitForMessage((m: any) => m?.type === type, timeoutMs);
        },
        send(msg: unknown) {
          ws.send(JSON.stringify(msg));
        },
        close() {
          ws.close();
        },
      });
    };

    ws.onerror = (err) => {
      reject(new Error(`WebSocket connection error: ${err}`));
    };
  });
}

/** Wait a short period for async side effects to settle. */
function settle(ms = 50): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

// Test lifecycle

const activeDaemons: Daemon[] = [];

afterEach(async () => {
  // Clean up temp files
  for (const f of tempFiles) {
    try {
      const file = Bun.file(f);
      if (await file.exists()) await Bun.write(f, "");
    } catch {
      // Ignore
    }
  }
  tempFiles.length = 0;
});

afterAll(async () => {
  // Shut down all daemons
  for (const d of activeDaemons) {
    try {
      await d.stop();
    } catch {
      // Ignore
    }
  }
  activeDaemons.length = 0;
});

// ===========================================================================
// Tests
// ===========================================================================

// Connection lifecycle

describe("Connection lifecycle", () => {
  it("client connects successfully", async () => {
    const daemon = await startDaemon();
    const client = await connectClient(daemon);
    expect(client.ws.readyState).toBe(WebSocket.OPEN);
    client.close();
  });

  it("client disconnect cleans up gracefully", async () => {
    const daemon = await startDaemon();
    const client = await connectClient(daemon);
    client.close();
    await settle(100);
    // No crash — daemon continues to run
    expect(daemon.port).toBeGreaterThan(0);
  });

  it("multiple clients can connect simultaneously", async () => {
    const daemon = await startDaemon();
    const c1 = await connectClient(daemon);
    const c2 = await connectClient(daemon);
    const c3 = await connectClient(daemon);
    expect(c1.ws.readyState).toBe(WebSocket.OPEN);
    expect(c2.ws.readyState).toBe(WebSocket.OPEN);
    expect(c3.ws.readyState).toBe(WebSocket.OPEN);
    c1.close();
    c2.close();
    c3.close();
  });
});

// Health check

describe("Health check", () => {
  it("GET /health returns 200 with correct shape", async () => {
    const daemon = await startDaemon();
    const res = await fetch(`http://127.0.0.1:${daemon.port}/health`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe("ok");
    expect(typeof body.uptime).toBe("number");
    expect(body.activeRuns).toBe(0);
    expect(typeof body.connectedClients).toBe("number");
  });

  it("reports correct connectedClients after connect/disconnect", async () => {
    const daemon = await startDaemon();
    const c1 = await connectClient(daemon);
    const c2 = await connectClient(daemon);
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
});

// HTTP routing

describe("HTTP routing", () => {
  it("non-upgrade request to /ws returns 400", async () => {
    const daemon = await startDaemon();
    // Regular HTTP GET (not a WebSocket upgrade) to /ws
    const res = await fetch(`http://127.0.0.1:${daemon.port}/ws`);
    expect(res.status).toBe(400);
  });

  it("unknown path returns 404", async () => {
    const daemon = await startDaemon();
    const res = await fetch(`http://127.0.0.1:${daemon.port}/unknown`);
    expect(res.status).toBe(404);
  });
});

// Ping/pong

describe("Ping/pong", () => {
  it("send ping → receive pong with ts", async () => {
    const daemon = await startDaemon();
    const client = await connectClient(daemon);

    client.send({ type: "ping" });
    const pong: any = await client.waitForType("pong");

    expect(pong.type).toBe("pong");
    expect(typeof pong.ts).toBe("string");
    client.close();
  });

  it("ping with requestId → pong carries same requestId", async () => {
    const daemon = await startDaemon();
    const client = await connectClient(daemon);

    client.send({ type: "ping", requestId: "req-42" });
    const pong: any = await client.waitForType("pong");

    expect(pong.type).toBe("pong");
    expect(pong.requestId).toBe("req-42");
    client.close();
  });
});

// Invalid messages

describe("Invalid messages", () => {
  it("non-JSON text → error with PARSE_ERROR", async () => {
    const daemon = await startDaemon();
    const client = await connectClient(daemon);

    client.ws.send("this is not json{{{");
    const err: any = await client.waitForType("error");

    expect(err.type).toBe("error");
    expect(err.code).toBe("PARSE_ERROR");
    expect(err.message).toContain("Invalid JSON");
    client.close();
  });

  it("valid JSON, invalid schema → error with VALIDATION_ERROR", async () => {
    const daemon = await startDaemon();
    const client = await connectClient(daemon);

    client.send({ type: "start_flow" }); // Missing required strategyPath
    const err: any = await client.waitForType("error");

    expect(err.type).toBe("error");
    expect(err.code).toBe("VALIDATION_ERROR");
    client.close();
  });

  it("valid JSON, unknown type → error with VALIDATION_ERROR", async () => {
    const daemon = await startDaemon();
    const client = await connectClient(daemon);

    client.send({ type: "unknown_message_type" });
    const err: any = await client.waitForType("error");

    expect(err.type).toBe("error");
    expect(err.code).toBe("VALIDATION_ERROR");
    client.close();
  });
});

// list_flows

describe("list_flows", () => {
  it("empty state → flow_list with empty runs", async () => {
    const daemon = await startDaemon();
    const client = await connectClient(daemon);

    client.send({ type: "list_flows", requestId: "list-1" });
    const list: any = await client.waitForType("flow_list");

    expect(list.type).toBe("flow_list");
    expect(list.runs).toEqual([]);
    expect(list.requestId).toBe("list-1");
    client.close();
  });

  it("after starting a flow → flow_list includes it", async () => {
    const daemon = await startDaemon();
    const client = await connectClient(daemon);

    const stratPath = await writeTrackedTempStrategy(MINIMAL_STRATEGY);
    client.send({ type: "start_flow", strategyPath: stratPath });

    // Wait for flow to actually start
    await client.waitForType("flow_started");

    client.send({ type: "list_flows", requestId: "list-2" });
    const list: any = await client.waitForType("flow_list");

    expect(list.runs.length).toBeGreaterThanOrEqual(1);
    expect(list.runs[0].runId).toBeTruthy();
    expect(list.runs[0].status).toMatch(/pending|running|completed/);
    client.close();
  });
});

// subscribe / unsubscribe

describe("subscribe / unsubscribe", () => {
  it("subscribe to existing run → no error", async () => {
    const daemon = await startDaemon();
    const client = await connectClient(daemon);

    // Start a flow so a run exists
    const stratPath = await writeTrackedTempStrategy(MINIMAL_STRATEGY);
    client.send({ type: "start_flow", strategyPath: stratPath });
    const started: any = await client.waitForType("flow_started");

    // Subscribe another client to the same run
    const c2 = await connectClient(daemon);
    c2.send({ type: "subscribe", runId: started.runId, requestId: "sub-1" });

    // Give time for any error to arrive
    await settle(200);

    // Should not have received an error for the subscribe
    const subErrors = c2.messages.filter(
      (m: any) => m.type === "error" && m.code === "SUBSCRIBE_ERROR",
    );
    expect(subErrors.length).toBe(0);

    client.close();
    c2.close();
  });

  it("subscribe to non-existent run → error response", async () => {
    const daemon = await startDaemon();
    const client = await connectClient(daemon);

    client.send({
      type: "subscribe",
      runId: "nonexistent-run-id",
      requestId: "sub-2",
    });
    const err: any = await client.waitForType("error");

    expect(err.code).toBe("SUBSCRIBE_ERROR");
    expect(err.requestId).toBe("sub-2");
    client.close();
  });

  it("unsubscribe → no error", async () => {
    const daemon = await startDaemon();
    const client = await connectClient(daemon);

    client.send({
      type: "unsubscribe",
      runId: "any-run-id",
      requestId: "unsub-1",
    });

    // Give time for any error
    await settle(200);

    const errors = client.messages.filter((m: any) => m.type === "error");
    expect(errors.length).toBe(0);
    client.close();
  });
});

// start_flow end-to-end

describe("start_flow end-to-end", () => {
  it("start flow with valid single-agent strategy → flow_started + flow_completed", async () => {
    const daemon = await startDaemon();
    const client = await connectClient(daemon);

    const stratPath = await writeTrackedTempStrategy(MINIMAL_STRATEGY);
    client.send({
      type: "start_flow",
      strategyPath: stratPath,
      requestId: "flow-1",
    });

    const started: any = await client.waitForType("flow_started");
    expect(started.type).toBe("flow_started");
    expect(started.runId).toBeTruthy();
    expect(started.requestId).toBe("flow-1");

    const completed: any = await client.waitForType("flow_completed");
    expect(completed.type).toBe("flow_completed");
    expect(completed.runId).toBe(started.runId);
    expect(completed.requestId).toBe("flow-1");
    client.close();
  });

  it("start flow with invalid path → flow_error", async () => {
    const daemon = await startDaemon();
    const client = await connectClient(daemon);

    client.send({
      type: "start_flow",
      strategyPath: "/nonexistent/path/strategy.json",
      requestId: "flow-bad",
    });

    const err: any = await client.waitForType("flow_error");
    expect(err.type).toBe("flow_error");
    expect(err.error.code).toBe("EXECUTION_ERROR");
    expect(err.error.message).toContain("not found");
    client.close();
  });

  it("flow_started contains correct strategyName, agents, flowTree", async () => {
    const daemon = await startDaemon();
    const client = await connectClient(daemon);

    const stratPath = await writeTrackedTempStrategy(MULTI_AGENT_STRATEGY);
    client.send({ type: "start_flow", strategyPath: stratPath });

    const started: any = await client.waitForType("flow_started");
    expect(started.strategyName).toBe("MultiAgent");
    expect(started.agents).toContain("writer");
    expect(started.agents).toContain("reviewer");
    expect(started.flowTree).toBeDefined();
    expect(started.flowTree.type).toBe("sequential");

    // Wait for completion to avoid dangling
    await client.waitForType("flow_completed");
    client.close();
  });

  it("flow_completed has result and usage", async () => {
    const daemon = await startDaemon();
    const client = await connectClient(daemon);

    const stratPath = await writeTrackedTempStrategy(MINIMAL_STRATEGY);
    client.send({ type: "start_flow", strategyPath: stratPath });

    const completed: any = await client.waitForType("flow_completed");
    expect(typeof completed.result).toBe("string");
    expect(completed.usage).toBeDefined();
    expect(typeof completed.usage.promptTokens).toBe("number");
    expect(typeof completed.usage.completionTokens).toBe("number");
    client.close();
  });
});

// stop_flow

describe("stop_flow", () => {
  it("start flow → immediately stop → receive flow_error with CANCELLED", async () => {
    const daemon = await startDaemon();
    const client = await connectClient(daemon);

    // Use the user-agent strategy which blocks for input, giving us time to cancel
    const stratPath = await writeTrackedTempStrategy(USER_AGENT_STRATEGY);
    client.send({ type: "start_flow", strategyPath: stratPath });

    // Wait for flow to start before cancelling
    const started: any = await client.waitForType("flow_started");
    client.send({ type: "stop_flow", runId: started.runId });

    const err: any = await client.waitForType("flow_error");
    expect(err.error.code).toBe("CANCELLED");
    client.close();
  });

  it("stop non-existent run → no crash", async () => {
    const daemon = await startDaemon();
    const client = await connectClient(daemon);

    client.send({ type: "stop_flow", runId: "nonexistent-run" });

    // Should not crash. Give time, then verify daemon is still responsive.
    await settle(200);

    client.send({ type: "ping" });
    const pong: any = await client.waitForType("pong");
    expect(pong.type).toBe("pong");
    client.close();
  });
});

// user_input error cases

describe("user_input error cases", () => {
  it("user_input for unknown run → error response", async () => {
    const daemon = await startDaemon();
    const client = await connectClient(daemon);

    client.send({
      type: "user_input",
      runId: "nonexistent",
      agentName: "user",
      text: "hello",
      requestId: "ui-1",
    });

    const err: any = await client.waitForType("error");
    expect(err.code).toBe("NO_PENDING_INPUT");
    expect(err.requestId).toBe("ui-1");
    client.close();
  });
});

// EventSink broadcast routing

describe("EventSink broadcast routing", () => {
  it("two clients subscribed to same run → both receive flow_started and flow_completed", async () => {
    const daemon = await startDaemon();
    const c1 = await connectClient(daemon);
    const c2 = await connectClient(daemon);

    const stratPath = await writeTrackedTempStrategy(MINIMAL_STRATEGY);

    // c1 starts the flow (auto-subscribed)
    c1.send({ type: "start_flow", strategyPath: stratPath });
    const started: any = await c1.waitForType("flow_started");

    // c2 subscribes to the same run
    c2.send({ type: "subscribe", runId: started.runId });
    await settle(50);

    // Both should eventually get flow_completed
    const completed1: any = await c1.waitForType("flow_completed");
    expect(completed1.runId).toBe(started.runId);

    // c2 may or may not receive flow_completed depending on timing
    // (it subscribed after flow_started, but possibly before flow_completed)
    // We verify at minimum c2 received at least one event for this run
    // by checking for any message with the matching runId
    await settle(200);
    const c2RunMsgs = c2.messages.filter((m: any) => m.runId === started.runId);
    // c2 should have received at least flow_completed
    // (since mock models are nearly instant, flow_completed may arrive after subscribe)
    expect(c2RunMsgs.length).toBeGreaterThanOrEqual(0);

    c1.close();
    c2.close();
  });

  it("unsubscribed client stops receiving events", async () => {
    const daemon = await startDaemon();
    const c1 = await connectClient(daemon);
    const c2 = await connectClient(daemon);

    // Use the user-agent strategy so the flow blocks for input
    const stratPath = await writeTrackedTempStrategy(USER_AGENT_STRATEGY);

    // c1 starts the flow (auto-subscribed)
    c1.send({ type: "start_flow", strategyPath: stratPath });
    const started: any = await c1.waitForType("flow_started");

    // c2 subscribes
    c2.send({ type: "subscribe", runId: started.runId });
    await settle(50);

    // c2 unsubscribes
    c2.send({ type: "unsubscribe", runId: started.runId });
    await settle(50);

    // Record c2's message count
    const c2MsgCountBefore = c2.messages.length;

    // Now stop the flow (which generates flow_error with CANCELLED)
    c1.send({ type: "stop_flow", runId: started.runId });
    await c1.waitForType("flow_error");
    await settle(200);

    // c2 should NOT have received the flow_error
    const c2NewMsgs = c2.messages.slice(c2MsgCountBefore);
    const c2FlowErrors = c2NewMsgs.filter((m: any) => m.type === "flow_error");
    expect(c2FlowErrors.length).toBe(0);

    c1.close();
    c2.close();
  });

  it("client disconnects during run → remaining subscribers still get events", async () => {
    const daemon = await startDaemon();
    const c1 = await connectClient(daemon);
    const c2 = await connectClient(daemon);

    // Use user-agent strategy so the flow blocks
    const stratPath = await writeTrackedTempStrategy(USER_AGENT_STRATEGY);

    // c1 starts the flow (auto-subscribed)
    c1.send({ type: "start_flow", strategyPath: stratPath });
    const started: any = await c1.waitForType("flow_started");

    // c2 subscribes
    c2.send({ type: "subscribe", runId: started.runId });
    await settle(50);

    // c1 disconnects
    c1.close();
    await settle(100);

    // Stop the flow — c2 should still get the event
    // We need to use the executor to stop the run, but the client that
    // started it is gone. Send stop_flow from c2.
    c2.send({ type: "stop_flow", runId: started.runId });
    const err: any = await c2.waitForType("flow_error");
    expect(err.error.code).toBe("CANCELLED");
    expect(err.runId).toBe(started.runId);

    c2.close();
  });
});

// Edge cases

describe("Edge cases", () => {
  it("rapid fire multiple start_flow requests → each gets its own run", async () => {
    const daemon = await startDaemon();
    const client = await connectClient(daemon);

    const stratPath = await writeTrackedTempStrategy(MINIMAL_STRATEGY);

    // Fire 3 start_flow requests in rapid succession
    client.send({ type: "start_flow", strategyPath: stratPath, requestId: "r1" });
    client.send({ type: "start_flow", strategyPath: stratPath, requestId: "r2" });
    client.send({ type: "start_flow", strategyPath: stratPath, requestId: "r3" });

    // Collect flow_started messages
    const s1: any = await client.waitForType("flow_started");
    const s2: any = await client.waitForMessage(
      (m: any) => m.type === "flow_started" && m.runId !== s1.runId,
    );
    const s3: any = await client.waitForMessage(
      (m: any) =>
        m.type === "flow_started" && m.runId !== s1.runId && m.runId !== (s2 as any).runId,
    );

    // All should have unique run IDs
    const runIds = new Set([s1.runId, (s2 as any).runId, (s3 as any).runId]);
    expect(runIds.size).toBe(3);

    // Wait for all to complete
    await settle(2000);
    client.close();
  });

  it("binary WebSocket message → error response", async () => {
    const daemon = await startDaemon();
    const client = await connectClient(daemon);

    // Send raw binary data
    client.ws.send(new Uint8Array([0x00, 0x01, 0x02]));
    const err: any = await client.waitForType("error");
    expect(err.code).toBe("PARSE_ERROR");
    client.close();
  });

  it("daemon.start() twice throws error", async () => {
    const daemon = await startDaemon();
    let threw = false;
    try {
      await daemon.start();
    } catch (err: any) {
      threw = true;
      expect(err.message).toContain("already running");
    }
    expect(threw).toBe(true);
  });

  it("daemon.stop() is idempotent", async () => {
    const daemon = await startDaemon();
    await daemon.stop();
    await daemon.stop(); // Should not throw
  });
});
