// E2E: Daemon strategy execution — full pipeline from WebSocket message
// through strategy loading, agent execution, and event broadcasting.
//
// Tests cover:
// 1. Single-agent flow (start → events → completion)
// 2. Multi-agent sequential flow (step events for each agent)
// 3. User input flow (request_input → user_input → completion)
// 4. Broadcast (parallel) flow
// 5. Stop/cancel flow
// 6. Multi-client event routing (subscribe, unsubscribe, isolation)
// 7. Concurrent flows (multiple simultaneous runs)
// 8. Error cases (invalid strategy path, missing fields)

import { afterAll, afterEach, describe, expect, it } from "bun:test";

import {
  BROADCAST_STRATEGY,
  MINIMAL_STRATEGY,
  MULTI_AGENT_STRATEGY,
  USER_AGENT_STRATEGY,
} from "./helpers/mock-providers";
import {
  cleanupTempFiles,
  connectTestClient,
  settle,
  startTestDaemon,
  stopAllDaemons,
  writeTempStrategy,
} from "./helpers/ws-client";

// Lifecycle

afterEach(async () => {
  await cleanupTempFiles();
});

afterAll(async () => {
  await stopAllDaemons();
});

// ===========================================================================
// Tests
// ===========================================================================

describe("E2E: Daemon Strategy Execution", () => {
  // -----------------------------------------------------------------------
  // 1. Single-agent flow
  // -----------------------------------------------------------------------

  describe("single-agent flow", () => {
    it("should execute and return flow_started + flow_completed", async () => {
      const daemon = await startTestDaemon();
      const client = await connectTestClient(daemon);
      const stratPath = await writeTempStrategy(MINIMAL_STRATEGY);

      client.send({
        type: "start_flow",
        strategyPath: stratPath,
        requestId: "single-1",
      });

      const started: any = await client.waitForType("flow_started");
      expect(started.type).toBe("flow_started");
      expect(started.runId).toBeTruthy();
      expect(started.strategyName).toBe("Test");
      expect(started.agents).toContain("assistant");
      expect(started.flowTree).toBeDefined();
      expect(started.requestId).toBe("single-1");

      const completed: any = await client.waitForType("flow_completed");
      expect(completed.type).toBe("flow_completed");
      expect(completed.runId).toBe(started.runId);
      expect(typeof completed.result).toBe("string");
      expect(completed.result).toContain("response from");
      expect(completed.usage).toBeDefined();
      expect(typeof completed.usage.promptTokens).toBe("number");
      expect(typeof completed.usage.completionTokens).toBe("number");
      expect(completed.requestId).toBe("single-1");

      client.close();
    });

    it("should emit step_started and step_completed events", async () => {
      const daemon = await startTestDaemon();
      const client = await connectTestClient(daemon);
      const stratPath = await writeTempStrategy(MINIMAL_STRATEGY);

      client.send({ type: "start_flow", strategyPath: stratPath });

      await client.waitForType("flow_started");

      // Should get at least one step_started + step_completed
      const stepStarted: any = await client.waitForType("step_started");
      expect(stepStarted.type).toBe("step_started");
      expect(stepStarted.stepName).toBeTruthy();
      expect(typeof stepStarted.message).toBe("string");

      const stepCompleted: any = await client.waitForType("step_completed");
      expect(stepCompleted.type).toBe("step_completed");
      expect(stepCompleted.stepName).toBeTruthy();
      expect(stepCompleted.result).toBeDefined();
      expect(typeof stepCompleted.result.text).toBe("string");

      await client.waitForType("flow_completed");
      client.close();
    });

    it("should emit agent_output for each agent call", async () => {
      const daemon = await startTestDaemon();
      const client = await connectTestClient(daemon);
      const stratPath = await writeTempStrategy(MINIMAL_STRATEGY);

      client.send({ type: "start_flow", strategyPath: stratPath });

      await client.waitForType("flow_started");

      const output: any = await client.waitForType("agent_output");
      expect(output.type).toBe("agent_output");
      expect(typeof output.text).toBe("string");
      expect(output.text).toContain("response from");

      await client.waitForType("flow_completed");
      client.close();
    });

    it("should include the flow in list_flows while running", async () => {
      const daemon = await startTestDaemon();
      const client = await connectTestClient(daemon);

      // Use a user-agent strategy that blocks (so the run stays active)
      const stratPath = await writeTempStrategy(USER_AGENT_STRATEGY);
      client.send({ type: "start_flow", strategyPath: stratPath });

      const started: any = await client.waitForType("flow_started");

      // List flows while the run is active
      client.send({ type: "list_flows", requestId: "list-active" });
      const list: any = await client.waitForType("flow_list");

      expect(list.runs.length).toBeGreaterThanOrEqual(1);
      const run = list.runs.find((r: any) => r.runId === started.runId);
      expect(run).toBeDefined();
      expect(run.status).toMatch(/pending|running/);

      // Clean up — stop the blocking flow
      client.send({ type: "stop_flow", runId: started.runId });
      await client.waitForType("flow_error");
      client.close();
    });
  });

  // -----------------------------------------------------------------------
  // 2. Multi-agent sequential flow
  // -----------------------------------------------------------------------

  describe("multi-agent sequential flow", () => {
    it("should execute both agents and emit events for each step", async () => {
      const daemon = await startTestDaemon();
      const client = await connectTestClient(daemon);
      const stratPath = await writeTempStrategy(MULTI_AGENT_STRATEGY);

      client.send({ type: "start_flow", strategyPath: stratPath });

      const started: any = await client.waitForType("flow_started");
      expect(started.strategyName).toBe("MultiAgent");
      expect(started.agents).toContain("writer");
      expect(started.agents).toContain("reviewer");

      // Should get two step_started events (writer, then reviewer)
      const steps = await client.waitForN(2, (m: any) => m?.type === "step_started", 5000);
      expect(steps.length).toBe(2);

      // Should get two step_completed events
      const completions = await client.waitForN(2, (m: any) => m?.type === "step_completed", 5000);
      expect(completions.length).toBe(2);

      const completed: any = await client.waitForType("flow_completed");
      expect(completed.result).toContain("response from");
      client.close();
    });

    it("should produce agent_output events for both agents", async () => {
      const daemon = await startTestDaemon();
      const client = await connectTestClient(daemon);
      const stratPath = await writeTempStrategy(MULTI_AGENT_STRATEGY);

      client.send({ type: "start_flow", strategyPath: stratPath });
      await client.waitForType("flow_started");

      // Wait for two agent_output events
      const outputs = await client.waitForN(2, (m: any) => m?.type === "agent_output", 5000);
      expect(outputs.length).toBe(2);
      for (const output of outputs) {
        expect((output as any).text).toContain("response from");
      }

      await client.waitForType("flow_completed");
      client.close();
    });
  });

  // -----------------------------------------------------------------------
  // 3. User input flow
  // -----------------------------------------------------------------------

  describe("user input flow", () => {
    it("should emit request_input and accept user_input response", async () => {
      const daemon = await startTestDaemon();
      const client = await connectTestClient(daemon);
      const stratPath = await writeTempStrategy(USER_AGENT_STRATEGY);

      client.send({ type: "start_flow", strategyPath: stratPath });

      const started: any = await client.waitForType("flow_started");

      // The user agent should trigger request_input
      const requestInput: any = await client.waitForType("request_input");
      expect(requestInput.type).toBe("request_input");
      expect(requestInput.runId).toBe(started.runId);
      expect(requestInput.agentName).toBe("user");

      // Respond with user input
      client.send({
        type: "user_input",
        runId: started.runId,
        agentName: "user",
        text: "Hello from the test!",
      });

      // Flow should continue — the assistant agent runs next
      const completed: any = await client.waitForType("flow_completed");
      expect(completed.runId).toBe(started.runId);
      expect(completed.result).toContain("response from");

      client.close();
    });

    it("should return NO_PENDING_INPUT for unknown run", async () => {
      const daemon = await startTestDaemon();
      const client = await connectTestClient(daemon);

      client.send({
        type: "user_input",
        runId: "nonexistent-run",
        agentName: "user",
        text: "test",
        requestId: "ui-err",
      });

      const err: any = await client.waitForType("error");
      expect(err.code).toBe("NO_PENDING_INPUT");
      expect(err.requestId).toBe("ui-err");
      client.close();
    });
  });

  // -----------------------------------------------------------------------
  // 4. Broadcast (parallel) flow
  // -----------------------------------------------------------------------

  describe("broadcast flow", () => {
    it("should execute all agents in parallel and complete", async () => {
      const daemon = await startTestDaemon();
      const client = await connectTestClient(daemon);
      const stratPath = await writeTempStrategy(BROADCAST_STRATEGY);

      client.send({ type: "start_flow", strategyPath: stratPath });

      const started: any = await client.waitForType("flow_started");
      expect(started.strategyName).toBe("Broadcast");
      expect(started.agents).toContain("fast");
      expect(started.agents).toContain("slow");

      const completed: any = await client.waitForType("flow_completed");
      expect(completed.runId).toBe(started.runId);
      expect(typeof completed.result).toBe("string");

      client.close();
    });
  });

  // -----------------------------------------------------------------------
  // 5. Stop/cancel flow
  // -----------------------------------------------------------------------

  describe("stop/cancel flow", () => {
    it("should cancel a running flow and emit flow_error CANCELLED", async () => {
      const daemon = await startTestDaemon();
      const client = await connectTestClient(daemon);

      // User agent strategy blocks for input — gives us time to cancel
      const stratPath = await writeTempStrategy(USER_AGENT_STRATEGY);
      client.send({ type: "start_flow", strategyPath: stratPath });

      const started: any = await client.waitForType("flow_started");

      // Cancel the flow
      client.send({ type: "stop_flow", runId: started.runId });

      const err: any = await client.waitForType("flow_error");
      expect(err.type).toBe("flow_error");
      expect(err.runId).toBe(started.runId);
      expect(err.error.code).toBe("CANCELLED");

      client.close();
    });

    it("should handle stopping a non-existent run without crashing", async () => {
      const daemon = await startTestDaemon();
      const client = await connectTestClient(daemon);

      client.send({ type: "stop_flow", runId: "nonexistent-run" });
      await settle(200);

      // Daemon should still be responsive
      client.send({ type: "ping" });
      const pong: any = await client.waitForType("pong");
      expect(pong.type).toBe("pong");

      client.close();
    });
  });

  // -----------------------------------------------------------------------
  // 6. Multi-client event routing
  // -----------------------------------------------------------------------

  describe("multi-client event routing", () => {
    it("should auto-subscribe the starting client to run events", async () => {
      const daemon = await startTestDaemon();
      const client = await connectTestClient(daemon);
      const stratPath = await writeTempStrategy(MINIMAL_STRATEGY);

      client.send({ type: "start_flow", strategyPath: stratPath });

      // The starting client should receive all events without explicit subscribe
      const started: any = await client.waitForType("flow_started");
      expect(started.runId).toBeTruthy();

      const completed: any = await client.waitForType("flow_completed");
      expect(completed.runId).toBe(started.runId);

      client.close();
    });

    it("should deliver events to subscribed second client", async () => {
      const daemon = await startTestDaemon();
      const c1 = await connectTestClient(daemon);
      const c2 = await connectTestClient(daemon);

      // Use blocking strategy so c2 has time to subscribe
      const stratPath = await writeTempStrategy(USER_AGENT_STRATEGY);
      c1.send({ type: "start_flow", strategyPath: stratPath });

      const started: any = await c1.waitForType("flow_started");

      // c2 subscribes to the run
      c2.send({ type: "subscribe", runId: started.runId });
      await settle(50);

      // Stop the flow — both clients should get flow_error
      c1.send({ type: "stop_flow", runId: started.runId });

      const err1: any = await c1.waitForType("flow_error");
      expect(err1.error.code).toBe("CANCELLED");

      const err2: any = await c2.waitForType("flow_error");
      expect(err2.error.code).toBe("CANCELLED");
      expect(err2.runId).toBe(started.runId);

      c1.close();
      c2.close();
    });

    it("should stop delivering events after unsubscribe", async () => {
      const daemon = await startTestDaemon();
      const c1 = await connectTestClient(daemon);
      const c2 = await connectTestClient(daemon);

      const stratPath = await writeTempStrategy(USER_AGENT_STRATEGY);
      c1.send({ type: "start_flow", strategyPath: stratPath });

      const started: any = await c1.waitForType("flow_started");

      // c2 subscribes then immediately unsubscribes
      c2.send({ type: "subscribe", runId: started.runId });
      await settle(50);
      c2.send({ type: "unsubscribe", runId: started.runId });
      await settle(50);

      // Record c2's message count
      const c2MsgCountBefore = c2.messages.length;

      // Stop the flow — should generate flow_error
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

    it("should handle subscriber disconnect without blocking events to others", async () => {
      const daemon = await startTestDaemon();
      const c1 = await connectTestClient(daemon);
      const c2 = await connectTestClient(daemon);

      const stratPath = await writeTempStrategy(USER_AGENT_STRATEGY);
      c1.send({ type: "start_flow", strategyPath: stratPath });

      const started: any = await c1.waitForType("flow_started");

      // c2 subscribes
      c2.send({ type: "subscribe", runId: started.runId });
      await settle(50);

      // c1 disconnects (the original client!)
      c1.close();
      await settle(100);

      // c2 can still stop the flow and receive events
      c2.send({ type: "stop_flow", runId: started.runId });
      const err: any = await c2.waitForType("flow_error");
      expect(err.error.code).toBe("CANCELLED");

      c2.close();
    });

    it("should return SUBSCRIBE_ERROR for non-existent run", async () => {
      const daemon = await startTestDaemon();
      const client = await connectTestClient(daemon);

      client.send({
        type: "subscribe",
        runId: "nonexistent-run",
        requestId: "sub-err",
      });

      const err: any = await client.waitForType("error");
      expect(err.code).toBe("SUBSCRIBE_ERROR");
      expect(err.requestId).toBe("sub-err");

      client.close();
    });
  });

  // -----------------------------------------------------------------------
  // 7. Concurrent flows
  // -----------------------------------------------------------------------

  describe("concurrent flows", () => {
    it("should run multiple flows simultaneously with unique run IDs", async () => {
      const daemon = await startTestDaemon();
      const client = await connectTestClient(daemon);

      const stratPath = await writeTempStrategy(MINIMAL_STRATEGY);

      // Fire 3 start_flow requests in rapid succession
      client.send({ type: "start_flow", strategyPath: stratPath, requestId: "r1" });
      client.send({ type: "start_flow", strategyPath: stratPath, requestId: "r2" });
      client.send({ type: "start_flow", strategyPath: stratPath, requestId: "r3" });

      // Collect all flow_started messages
      const starts = await client.waitForN(3, (m: any) => m?.type === "flow_started", 5000);

      // All should have unique run IDs
      const runIds = new Set(starts.map((s: any) => s.runId));
      expect(runIds.size).toBe(3);

      // All should complete
      const completions = await client.waitForN(3, (m: any) => m?.type === "flow_completed", 5000);
      expect(completions.length).toBe(3);

      client.close();
    });

    it("should isolate events between different runs", async () => {
      const daemon = await startTestDaemon();
      const c1 = await connectTestClient(daemon);
      const c2 = await connectTestClient(daemon);

      const stratPath = await writeTempStrategy(MINIMAL_STRATEGY);

      // Each client starts their own flow
      c1.send({ type: "start_flow", strategyPath: stratPath, requestId: "c1-flow" });
      c2.send({ type: "start_flow", strategyPath: stratPath, requestId: "c2-flow" });

      const s1: any = await c1.waitForType("flow_started");
      const s2: any = await c2.waitForType("flow_started");

      // Run IDs should differ
      expect(s1.runId).not.toBe(s2.runId);

      // Each client should get their own flow_completed
      const comp1: any = await c1.waitForType("flow_completed");
      const comp2: any = await c2.waitForType("flow_completed");

      expect(comp1.runId).toBe(s1.runId);
      expect(comp2.runId).toBe(s2.runId);

      // c1 should NOT have c2's run events (and vice versa)
      const c1RunIds = c1.messages.filter((m: any) => m.runId).map((m: any) => m.runId);
      const c2RunIds = c2.messages.filter((m: any) => m.runId).map((m: any) => m.runId);

      expect(c1RunIds.every((id: string) => id === s1.runId)).toBe(true);
      expect(c2RunIds.every((id: string) => id === s2.runId)).toBe(true);

      c1.close();
      c2.close();
    });
  });

  // -----------------------------------------------------------------------
  // 8. Error cases
  // -----------------------------------------------------------------------

  describe("error cases", () => {
    it("should return flow_error for non-existent strategy path", async () => {
      const daemon = await startTestDaemon();
      const client = await connectTestClient(daemon);

      client.send({
        type: "start_flow",
        strategyPath: "/nonexistent/path/strategy.json",
        requestId: "err-1",
      });

      const err: any = await client.waitForType("flow_error");
      expect(err.type).toBe("flow_error");
      expect(err.error.code).toBe("EXECUTION_ERROR");
      expect(err.error.message).toContain("not found");

      client.close();
    });

    it("should return flow_error for invalid strategy content", async () => {
      const daemon = await startTestDaemon();
      const client = await connectTestClient(daemon);

      // Write invalid strategy content
      const stratPath = await writeTempStrategy(JSON.stringify({ name: "Bad", version: "1.0" }));

      client.send({
        type: "start_flow",
        strategyPath: stratPath,
        requestId: "err-2",
      });

      const err: any = await client.waitForType("flow_error");
      expect(err.type).toBe("flow_error");
      expect(err.error.code).toBe("EXECUTION_ERROR");

      client.close();
    });

    it("should return flow_error for YAML strategy with missing agents", async () => {
      const daemon = await startTestDaemon();
      const client = await connectTestClient(daemon);

      // Write a YAML strategy missing agents and flow
      const yamlContent = `name: Incomplete\nversion: "1.0"\n`;
      const stratPath = await writeTempStrategy(yamlContent, "yaml");

      client.send({
        type: "start_flow",
        strategyPath: stratPath,
        requestId: "err-3",
      });

      const err: any = await client.waitForType("flow_error");
      expect(err.type).toBe("flow_error");
      expect(err.error.code).toBe("EXECUTION_ERROR");

      client.close();
    });
  });

  // -----------------------------------------------------------------------
  // 9. Event ordering
  // -----------------------------------------------------------------------

  describe("event ordering", () => {
    it("should emit events in correct order: flow_started → steps → flow_completed", async () => {
      const daemon = await startTestDaemon();
      const client = await connectTestClient(daemon);
      const stratPath = await writeTempStrategy(MINIMAL_STRATEGY);

      client.send({ type: "start_flow", strategyPath: stratPath });

      // Wait for completion
      await client.waitForType("flow_completed");

      // Analyze the order of messages with runId
      const runMsgs = client.messages.filter((m: any) => m.runId);
      const types = runMsgs.map((m: any) => m.type);

      // flow_started must come first
      expect(types[0]).toBe("flow_started");
      // flow_completed must come last
      expect(types[types.length - 1]).toBe("flow_completed");

      // step_started must come before step_completed
      const stepStartIdx = types.indexOf("step_started");
      const stepCompleteIdx = types.indexOf("step_completed");
      if (stepStartIdx >= 0 && stepCompleteIdx >= 0) {
        expect(stepStartIdx).toBeLessThan(stepCompleteIdx);
      }

      client.close();
    });

    it("should include timestamps on all daemon messages", async () => {
      const daemon = await startTestDaemon();
      const client = await connectTestClient(daemon);
      const stratPath = await writeTempStrategy(MINIMAL_STRATEGY);

      client.send({ type: "start_flow", strategyPath: stratPath });
      await client.waitForType("flow_completed");

      // All messages with runId should have a ts field
      const runMsgs = client.messages.filter((m: any) => m.runId);
      for (const msg of runMsgs) {
        expect(typeof (msg as any).ts).toBe("string");
        expect(Number.isNaN(Date.parse((msg as any).ts))).toBe(false);
      }

      client.close();
    });
  });
});
