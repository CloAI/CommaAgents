import { describe, expect, it } from "bun:test";
import { createConversationRecord } from "../conversation-context";
import { createTimeline } from "./timeline";
import type { TimelineEvent } from "./timeline.types";

function makeRunStarted(ts: string): TimelineEvent {
  return {
    type: "run_started",
    ts,
    strategyPath: "/strategy.json",
    strategyName: "Strategy",
    cwd: "/workspace",
  };
}

function makeAgentCall(agentName: string, ts: string): TimelineEvent {
  return {
    type: "agent_call",
    ts,
    record: createConversationRecord({
      id: `${agentName}-${ts}`,
      agentName,
      createdAt: ts,
      userMessage: "hello",
      responseMessages: [{ role: "assistant", content: "hi" }],
      text: "hi",
      usage: { promptTokens: 1, completionTokens: 1 },
      finishReason: "stop",
    }),
  };
}

describe("createTimeline", () => {
  it("should create an empty timeline", () => {
    const timeline = createTimeline();
    expect(timeline.size).toBe(0);
    expect(timeline.events().length).toBe(0);
  });

  it("should support initial events", () => {
    const event = makeRunStarted("2026-05-23T10:00:00.000Z");
    const timeline = createTimeline([event]);
    expect(timeline.size).toBe(1);
    expect(timeline.events()[0]).toBe(event);
  });

  it("should append valid events", () => {
    const timeline = createTimeline();
    const event = makeAgentCall("assistant", "2026-05-23T10:01:00.000Z");
    timeline.append(event);
    expect(timeline.size).toBe(1);
    expect(timeline.events()[0]).toBe(event);
  });

  it("should reject events without timestamps", () => {
    const timeline = createTimeline();
    const invalidEvent = { type: "run_started" } as TimelineEvent;
    expect(() => timeline.append(invalidEvent)).toThrow();
  });

  it("should support basic filters", () => {
    const timeline = createTimeline([
      makeRunStarted("2026-05-23T10:00:00Z"),
      makeAgentCall("writer", "2026-05-23T10:01:00Z"),
      makeAgentCall("critic", "2026-05-23T10:02:00Z"),
      {
        type: "run_completed",
        ts: "2026-05-23T10:03:00Z",
        status: "completed",
      },
    ]);

    expect(timeline.events({ type: "agent_call" }).length).toBe(2);
    expect(timeline.events({ agentName: "writer" }).length).toBe(1);
    expect(timeline.events({ since: "2026-05-23T10:01:00Z" }).length).toBe(2);
  });

  it("should provide an iterator", () => {
    const timeline = createTimeline([
      makeRunStarted("2026-05-23T10:00:00Z"),
      {
        type: "run_completed",
        ts: "2026-05-23T10:01:00Z",
        status: "completed",
      },
    ]);

    const events: TimelineEvent[] = [];
    for (const event of timeline) {
      events.push(event);
    }
    expect(events.length).toBe(2);
    expect(events[0]?.type).toBe("run_started");
  });
});
