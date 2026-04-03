// Tests for the input bridge — bridges UserAgent input requests over WS.

import { describe, expect, it } from "bun:test";

import { mockSink } from "../test.utils";
import { createInputBridge } from "./input-bridge";

describe("createInputBridge", () => {
  it("broadcasts request_input when collector is called", async () => {
    const sink = mockSink();
    const bridge = createInputBridge({ sink, runId: "run-1" });

    // Call the collector (don't await — we'll resolve it manually)
    const promise = bridge.collector({
      agentName: "user-agent",
      prompt: "What is your name?",
    });

    // Verify request_input was broadcast
    expect(sink.broadcasts).toHaveLength(1);
    const msg = sink.broadcasts[0].message;
    expect(msg.type).toBe("request_input");
    expect(sink.broadcasts[0].runId).toBe("run-1");
    if (msg.type === "request_input") {
      expect(msg.runId).toBe("run-1");
      expect(msg.agentName).toBe("user-agent");
      expect(msg.prompt).toBe("What is your name?");
      expect(msg.ts).toBeDefined();
    }

    // Resolve it so the promise doesn't hang
    bridge.resolveInput("user-agent", "Alice");
    const result = await promise;
    expect(result).toBe("Alice");
  });

  it("resolveInput resolves the pending promise", async () => {
    const sink = mockSink();
    const bridge = createInputBridge({ sink, runId: "run-1" });

    const promise = bridge.collector({
      agentName: "user-agent",
      prompt: "Enter input",
    });

    const resolved = bridge.resolveInput("user-agent", "hello world");
    expect(resolved).toBe(true);

    const result = await promise;
    expect(result).toBe("hello world");
  });

  it("resolveInput returns false for unknown agent", () => {
    const sink = mockSink();
    const bridge = createInputBridge({ sink, runId: "run-1" });

    const resolved = bridge.resolveInput("nonexistent-agent", "text");
    expect(resolved).toBe(false);
  });

  it("supports multiple concurrent requests for different agents", async () => {
    const sink = mockSink();
    const bridge = createInputBridge({ sink, runId: "run-1" });

    const promise1 = bridge.collector({
      agentName: "agent-a",
      prompt: "First",
    });
    const promise2 = bridge.collector({
      agentName: "agent-b",
      prompt: "Second",
    });

    expect(sink.broadcasts).toHaveLength(2);

    bridge.resolveInput("agent-b", "response-b");
    bridge.resolveInput("agent-a", "response-a");

    expect(await promise1).toBe("response-a");
    expect(await promise2).toBe("response-b");
  });

  it("rejects with timeout error when timeout expires", async () => {
    const sink = mockSink();
    const bridge = createInputBridge({ sink, runId: "run-1", timeout: 50 });

    const promise = bridge.collector({
      agentName: "user-agent",
      prompt: "Enter input",
    });

    await expect(promise).rejects.toThrow(/timed out after 50ms/);
  });

  it("rejects when abort signal fires", async () => {
    const sink = mockSink();
    const ac = new AbortController();
    const bridge = createInputBridge({
      sink,
      runId: "run-1",
      abort: ac.signal,
    });

    const promise = bridge.collector({
      agentName: "user-agent",
      prompt: "Enter input",
    });

    ac.abort();

    await expect(promise).rejects.toThrow("Run aborted");
  });

  it("rejects immediately if abort signal is already aborted", async () => {
    const sink = mockSink();
    const ac = new AbortController();
    ac.abort();

    const bridge = createInputBridge({
      sink,
      runId: "run-1",
      abort: ac.signal,
    });

    await expect(
      bridge.collector({ agentName: "user-agent", prompt: "Enter input" }),
    ).rejects.toThrow("Run aborted");

    // No broadcast should have been sent
    expect(sink.broadcasts).toHaveLength(0);
  });

  it("destroy rejects all pending requests", async () => {
    const sink = mockSink();
    const bridge = createInputBridge({ sink, runId: "run-1" });

    const promise1 = bridge.collector({
      agentName: "agent-a",
      prompt: "First",
    });
    const promise2 = bridge.collector({
      agentName: "agent-b",
      prompt: "Second",
    });

    bridge.destroy();

    await expect(promise1).rejects.toThrow("Input bridge destroyed");
    await expect(promise2).rejects.toThrow("Input bridge destroyed");
  });

  it("rejects new requests after destroy", async () => {
    const sink = mockSink();
    const bridge = createInputBridge({ sink, runId: "run-1" });

    bridge.destroy();

    await expect(
      bridge.collector({ agentName: "user-agent", prompt: "Enter input" }),
    ).rejects.toThrow("Input bridge destroyed");
  });

  it("resolveInput returns false after destroy", () => {
    const sink = mockSink();
    const bridge = createInputBridge({ sink, runId: "run-1" });

    bridge.destroy();

    expect(bridge.resolveInput("user-agent", "text")).toBe(false);
  });
});
