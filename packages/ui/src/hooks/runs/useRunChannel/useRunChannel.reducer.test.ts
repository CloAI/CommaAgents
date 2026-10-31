import { describe, expect, it } from "vitest";
import type {
  RunPhase,
  RunMessageStatus,
  RunOutcomeStatus,
} from "@comma-agents/daemon";
import { RunErrorCode } from "@comma-agents/daemon/protocol";
import { INITIAL_RUN_FEED } from "./useRunChannel.constants";
import { reduceRunFeed } from "./useRunChannel.reducer";
import {
  childLabel,
  childStatus,
  selectRunStatus,
} from "./useRunChannel.selectors";
import type { RunChannelMessage } from "./useRunChannel.types";

const createdAt = "2026-10-25T12:00:00.000Z";

function stream(
  messageId: string,
  contentIndex: number,
  text: string,
): RunChannelMessage {
  return {
    type: "agent.stream",
    data: {
      runId: "run-1",
      messageId,
      agentName: "planner",
      createdAt,
      contentIndex,
      content: { type: "text", text },
    },
  };
}

describe("reduceRunFeed", () => {
  it("should track a launched child run and update it in place as it finishes", () => {
    const launched = {
      type: "child.run" as const,
      messageId: "child-1",
      runId: "run-1",
      childRunId: "child-1",
      strategyName: "/work/subagents/explore/explore.json",
      createdAt,
      sourceMessageId: "message-1",
      toolCallId: "call-1",
      phase: "running" as RunPhase.running,
    };
    const running = reduceRunFeed(INITIAL_RUN_FEED, {
      type: "child.run",
      data: launched,
    });
    const finished = reduceRunFeed(running, {
      type: "child.run",
      data: {
        ...launched,
        strategyName: "Explore",
        phase: "terminal" as RunPhase.terminal,
        outcome: "completed" as RunOutcomeStatus.completed,
      },
    });
    expect(running.children.map(childLabel)).toEqual(["explore"]);
    expect(running.children.map(childStatus)).toEqual(["running"]);
    expect(finished.children).toHaveLength(1);
    expect(finished.children.map(childLabel)).toEqual(["Explore"]);
    expect(finished.children.map(childStatus)).toEqual(["completed"]);
  });

  it("should retain saved configuration and append a strategy marker only once across repeated snapshots", () => {
    const snapshot = {
      runId: "run-1",
      configuration: { strategyPath: "/work/build.json", cwd: "/work" },
      phase: "prepared" as RunPhase.prepared,
      strategy: {
        name: "Build",
        agents: ["coder"],
        flow: {
          name: "Build",
          type: "sequential",
          steps: [{ agent: "coder" }],
        },
      },
      unmatchedAgents: [],
      strategyState: {
        revision: 1,
        modelsByStrategy: {},
        handoff: { messages: [], eventOffset: 0 },
        changes: [
          {
            type: "strategy.changed" as const,
            messageId: "change-1",
            runId: "run-1",
            createdAt,
            revision: 1,
            previousName: "Plan",
            nextName: "Build",
            previousStrategyPath: "/work/plan.json",
            nextStrategyPath: "/work/build.json",
          },
        ],
      },
    };
    const first = reduceRunFeed(
      {
        ...INITIAL_RUN_FEED,
        initialized: true,
        pendingInputs: [pendingInput],
        activeAgents: [activeAgent],
      },
      { type: "run.state", data: snapshot },
    );
    const second = reduceRunFeed(first, { type: "run.state", data: snapshot });
    expect(second.snapshot?.configuration.strategyPath).toBe(
      "/work/build.json",
    );
    expect(selectRunStatus(second).status).toBe("prepared");
    expect(second.messages).toHaveLength(1);
    expect(second.messages[0]).toMatchObject({
      role: "strategy",
      content: [{ type: "text", text: "Strategy changed: Plan → Build" }],
    });
    expect(second.pendingInputs).toEqual([]);
    expect(second.activeAgents).toEqual([]);
  });
  it("should replace a streamed block with its later content", () => {
    const state = [stream("m1", 0, "Hel"), stream("m1", 0, "Hello")].reduce(
      reduceRunFeed,
      INITIAL_RUN_FEED,
    );

    expect(state.messages).toEqual([
      {
        id: "m1",
        role: "agent",
        agentName: "planner",
        createdAt,
        content: [{ type: "text", text: "Hello" }],
        streaming: true,
      },
    ]);
  });

  it("should fill skipped blocks with empty text", () => {
    const state = reduceRunFeed(INITIAL_RUN_FEED, stream("m1", 2, "Late"));

    expect(state.messages[0]?.content).toEqual([
      { type: "text", text: "" },
      { type: "text", text: "" },
      { type: "text", text: "Late" },
    ]);
  });

  it("should keep messages from different agents in order of first appearance", () => {
    const state = [
      stream("m1", 0, "One"),
      stream("m2", 0, "Two"),
      stream("m1", 0, "One!"),
    ].reduce(reduceRunFeed, INITIAL_RUN_FEED);

    expect(state.messages.map((message) => message.id)).toEqual(["m1", "m2"]);
  });
});

const pendingInput = {
  runId: "run-1",
  inputId: "input-1",
  agentName: "user",
  prompt: "Your next question",
};
const activeAgent = {
  runId: "run-1",
  messageId: "m1",
  agentName: "expert",
  createdAt,
};

describe("input and steering recipients", () => {
  it("should clear reply and steering recipients after a run ends", () => {
    const state = reduceRunFeed(
      {
        ...INITIAL_RUN_FEED,
        activeAgents: [activeAgent],
        pendingInputs: [pendingInput],
      },
      {
        type: "run.state",
        data: {
          runId: "run-1",
          configuration: { strategyPath: "/work/chat.json", cwd: "/work" },
          phase: "terminal" as RunPhase.terminal,
          strategy: null,
          outcome: { status: "stopped" as RunOutcomeStatus.stopped },
        },
      },
    );
    expect(selectRunStatus(state).status).toBe("stopped");
    expect(state.pendingInputs).toEqual([]);
    expect(state.activeAgents).toEqual([]);
  });

  it("should restore pending inputs and active agents on reconnect", () => {
    const state = reduceRunFeed(INITIAL_RUN_FEED, {
      type: "run.initial",
      data: {
        snapshot: {
          runId: "run-1",
          configuration: { strategyPath: "/work/chat.json", cwd: "/work" },
          phase: "running" as RunPhase.running,
          strategy: {
            name: "Chat",
            agents: ["user", "expert"],
            flow: {
              name: "Loop",
              type: "cycle",
              steps: [{ agent: "user" }, { agent: "expert" }],
            },
          },
        },
        history: { entries: [], page: { hasMore: false } },
        pendingInputs: [pendingInput],
        activeAgents: [activeAgent],
      },
    });
    expect(state.pendingInputs).toEqual([pendingInput]);
    expect(state.activeAgents).toEqual([activeAgent]);
    expect(state.initialized).toBe(true);
  });

  it("should remove only the answered input request", () => {
    const events: RunChannelMessage[] = [
      { type: "input.requested", data: pendingInput },
      {
        type: "input.requested",
        data: { ...pendingInput, inputId: "input-2" },
      },
      { type: "input.resolved", data: { runId: "run-1", inputId: "input-1" } },
    ];
    const state = events.reduce(reduceRunFeed, INITIAL_RUN_FEED);
    expect(state.pendingInputs.map((entry) => entry.inputId)).toEqual([
      "input-2",
    ]);
  });

  it("should keep interrupted output and remove the finished steering target", () => {
    let state = reduceRunFeed(INITIAL_RUN_FEED, {
      type: "agent.started",
      data: activeAgent,
    });
    state = reduceRunFeed(state, stream("m1", 0, "Partial answer"));
    state = reduceRunFeed(state, {
      type: "agent.output",
      data: {
        type: "message",
        ...activeAgent,
        role: "agent",
        status: "stopped" as RunMessageStatus.stopped,
        cancellationReason: "user_steering",
        content: [{ type: "text", text: "Partial answer" }],
      },
    });
    expect(state.activeAgents).toEqual([]);
    expect(state.messages[0]).toMatchObject({
      streaming: false,
      cancellationReason: "user_steering",
      content: [{ type: "text", text: "Partial answer" }],
    });
  });
});

describe("selectRunStatus", () => {
  const terminal = {
    runId: "run-1",
    configuration: { strategyPath: "/work/chat.json", cwd: "/work" },
    phase: "terminal" as RunPhase.terminal,
    strategy: null,
    outcome: { status: "stopped" as RunOutcomeStatus.stopped },
  };

  it("should report loading until a snapshot arrives", () => {
    expect(selectRunStatus(INITIAL_RUN_FEED).status).toBe("loading");
    expect(
      selectRunStatus(reduceRunFeed(INITIAL_RUN_FEED, stream("m1", 0, "Hi")))
        .status,
    ).toBe("loading");
  });

  it("should keep a reported failure when the terminal snapshot follows it", () => {
    const failed = reduceRunFeed(
      { ...INITIAL_RUN_FEED, activeAgents: [activeAgent] },
      {
        type: "run.error",
        data: {
          runId: "run-1",
          error: {
            code: RunErrorCode.EXECUTION_ERROR,
            metadata: { runId: "run-1" },
          },
        },
      },
    );
    const state = reduceRunFeed(failed, { type: "run.state", data: terminal });
    expect(failed.activeAgents).toEqual([]);
    expect(selectRunStatus(state)).toEqual({
      status: "failed",
      error: "Run failed (EXECUTION_ERROR).",
    });
  });
});
