import { describe, expect, it } from "vitest";
import type { AgentCallResult, LoadedStrategy } from "@comma-agents/core";
import { createRunStore } from "../../server/daemon-store";
import { mockRunRepository } from "../../test.utils";
import type { ExecutionContext } from "../systems";
import { createSystemRunContext } from "../systems/systems.test.utils";
import {
  createRunPersistenceEffect,
  createRunProtocolEffect,
} from "./run-effects";

const result: AgentCallResult = {
  text: "done",
  usage: { promptTokens: 10, completionTokens: 5 },
  finishReason: "stop",
  responseMessages: [],
  steps: [],
};

function createExecutionContext(): ExecutionContext & {
  messageSender: ReturnType<
    typeof import("../../test.utils").mockMessageSender
  >;
} {
  const runContext = createSystemRunContext();
  return {
    ...runContext,
    run: {
      id: runContext.run.id,
      strategyPath: runContext.run.strategyPath,
      strategyName: runContext.run.strategyName,
      startedAt: runContext.run.startedAt,
      cwd: runContext.run.cwd,
      status: "pending",
    },
    strategy: {
      name: "Test",
      agents: { assistant: {} },
      raw: { flow: { type: "sequential" } },
    } as unknown as LoadedStrategy,
    input: "start",
    requestId: "request-1",
  };
}

describe("run transition effects", () => {
  it("should persist and dispatch successful lifecycle transitions", async () => {
    const context = createExecutionContext();
    const runRepository = mockRunRepository();
    const runStore = createRunStore({
      id: context.run.id,
      strategyPath: context.run.strategyPath,
      strategyName: context.run.strategyName,
      cwd: context.run.cwd,
    });
    runStore.subscribeToTransitions(
      createRunPersistenceEffect({ context, runRepository }),
    );
    runStore.subscribeToTransitions(createRunProtocolEffect({ context }));

    await runStore.transition({ type: "running" });
    await runStore.transition({ type: "completed", result });

    expect(
      runRepository.runs.get(context.run.id)?.map((event) => event.type),
    ).toEqual(["run_started", "run_completed"]);
    expect(
      context.messageSender.broadcasts.map(({ message }) => message.type),
    ).toEqual(["strategy_started", "strategy_completed"]);
  });

  it("should persist and dispatch cancellation exactly once", async () => {
    const context = createExecutionContext();
    const runRepository = mockRunRepository();
    const runStore = createRunStore({
      id: context.run.id,
      strategyPath: context.run.strategyPath,
      strategyName: context.run.strategyName,
      cwd: context.run.cwd,
    });
    runStore.subscribeToTransitions(
      createRunPersistenceEffect({ context, runRepository }),
    );
    runStore.subscribeToTransitions(createRunProtocolEffect({ context }));
    await runStore.transition({ type: "running" });

    await runStore.transition({
      type: "cancelled",
      error: { code: "CANCELLED", message: "cancelled" },
    });

    expect(
      context.messageSender.broadcasts.filter(
        ({ message }) => message.type === "strategy_error",
      ),
    ).toHaveLength(1);
    expect(runRepository.runs.get(context.run.id)?.at(-1)).toMatchObject({
      type: "run_completed",
      status: "cancelled",
    });
  });
});
