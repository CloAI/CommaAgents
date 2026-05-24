import { describe, expect, it } from "bun:test";
import { createTimeline } from "./timeline";
import type { TimelineEvent } from "./timeline.types";

const makeEvent = (
  type: TimelineEvent["type"],
  ts: string,
  extra = {},
): TimelineEvent => {
  return { type, ts, ...extra } as any;
};

describe("createTimeline", () => {
  it("should create an empty timeline", () => {
    const timeline = createTimeline();
    expect(timeline.size).toBe(0);
    expect(timeline.events().length).toBe(0);
  });

  it("should support initial events", () => {
    const ev = makeEvent("run_started", "2026-05-23T10:00:00.000Z");
    const timeline = createTimeline([ev]);
    expect(timeline.size).toBe(1);
    expect(timeline.events()[0]).toBe(ev);
  });

  it("should append valid events", () => {
    const timeline = createTimeline();
    const ev = makeEvent("agent_call", "2026-05-23T10:01:00.000Z", {
      agentName: "assistant",
    });
    timeline.append(ev);
    expect(timeline.size).toBe(1);
    expect(timeline.events()[0]).toBe(ev);
  });

  it("should reject events without timestamps", () => {
    const timeline = createTimeline();
    expect(() => {
      timeline.append({ type: "run_started" } as any);
    }).toThrow();
  });

  it("should support basic filters", () => {
    const timeline = createTimeline([
      makeEvent("run_started", "2026-05-23T10:00:00Z"),
      makeEvent("agent_call", "2026-05-23T10:01:00Z", { agentName: "writer" }),
      makeEvent("agent_call", "2026-05-23T10:02:00Z", { agentName: "critic" }),
      makeEvent("run_completed", "2026-05-23T10:03:00Z"),
    ]);

    expect(timeline.events({ type: "agent_call" }).length).toBe(2);
    expect(timeline.events({ agentName: "writer" }).length).toBe(1);
    expect(timeline.events({ since: "2026-05-23T10:01:00Z" }).length).toBe(2); // index 2 and 3
  });

  it("should provide an iterator", () => {
    const timeline = createTimeline([
      makeEvent("run_started", "2026-05-23T10:00:00Z"),
      makeEvent("run_completed", "2026-05-23T10:01:00Z"),
    ]);

    const items: TimelineEvent[] = [];
    for (const ev of timeline) {
      items.push(ev);
    }
    expect(items.length).toBe(2);
    expect(items[0]?.type).toBe("run_started");
  });
});
