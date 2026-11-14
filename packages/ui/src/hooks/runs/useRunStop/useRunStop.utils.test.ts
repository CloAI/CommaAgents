import { describe, expect, it } from "vitest";
import type { RunPhase } from "@comma-agents/daemon";
import { INITIAL_RUN_FEED } from "../useRunChannel/useRunChannel.constants";
import { hasActiveWork } from "./useRunStop.utils";

const running = {
  ...INITIAL_RUN_FEED,
  initialized: true,
  snapshot: {
    runId: "run-1",
    configuration: { strategyPath: "/work/chat.json", cwd: "/work" },
    phase: "running" as RunPhase.running,
    strategy: {
      name: "Chat",
      agents: ["expert"],
      flow: { name: "Chat", type: "sequential", steps: [{ agent: "expert" }] },
    },
  },
  activeAgents: [
    { runId: "run-1", messageId: "m1", agentName: "expert", createdAt: "" },
  ],
};

describe("hasActiveWork", () => {
  it("should apply while an initialized running run has an active agent", () => {
    expect(hasActiveWork(running)).toBe(true);
  });

  it("should not apply before initialization or without an active agent", () => {
    expect(hasActiveWork({ ...running, initialized: false })).toBe(false);
    expect(hasActiveWork({ ...running, activeAgents: [] })).toBe(false);
  });
});
