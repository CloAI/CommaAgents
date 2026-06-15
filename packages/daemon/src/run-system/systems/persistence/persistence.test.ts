import { describe, expect, it } from "bun:test";
import type { AgentCallResult, LoadedStrategy } from "@comma-agents/core";
import { mockRunStore } from "../../../test.utils";
import { createSystemRunContext } from "../systems.test.utils";
import type { ExecutionContext } from "../systems.types";
import { createPersistenceSystem } from "./persistence";

const result: AgentCallResult = {
  text: "response",
  usage: { promptTokens: 10, completionTokens: 5 },
  finishReason: "stop",
  responseMessages: [],
  steps: [],
};

describe("createPersistenceSystem", () => {
  it("records run, flow, and agent events through its own hooks", async () => {
    const context = createSystemRunContext();
    const runStore = mockRunStore();
    const flowHooks = new Map<string, unknown>();
    const agentHooks = new Map<string, unknown>();
    const strategy = {
      name: "Test",
      version: "1.0",
      flow: {
        appendHook(name: string, callback: unknown): void {
          flowHooks.set(name, callback);
        },
      },
      agents: {
        assistant: {
          appendHook(name: string, callback: unknown): void {
            agentHooks.set(name, callback);
          },
        },
      },
      raw: {},
    } as unknown as LoadedStrategy;
    const executionContext: ExecutionContext = {
      ...context,
      strategy,
      input: "initial input",
      requestId: "start-1",
    };
    const system = createPersistenceSystem({
      logger: context.logger,
      runStore,
    });

    await system.onBeforeExecute?.(executionContext);

    const beforeStep = flowHooks.get("beforeStep") as (value: {
      stepName: string;
      message: string;
    }) => void;
    const afterStep = flowHooks.get("afterStep") as (value: {
      stepName: string;
      message: string;
      result: AgentCallResult;
    }) => void;
    const beforeCall = agentHooks.get("beforeCall") as (
      message: string,
    ) => void;
    const afterCallResult = agentHooks.get("afterCallResult") as (
      value: AgentCallResult,
    ) => void;

    beforeStep({ stepName: "assistant", message: "request" });
    afterStep({ stepName: "assistant", message: "request", result });
    beforeCall("request");
    afterCallResult(result);

    const events = await runStore.getEvents(context.run.id);
    expect(events.map((event) => event.type)).toEqual([
      "run_started",
      "step_started",
      "step_completed",
      "agent_call",
    ]);
    expect(events[0]).toMatchObject({
      type: "run_started",
      initialInput: "initial input",
    });
    expect(events[3]).toMatchObject({
      type: "agent_call",
      agentName: "assistant",
      userMessage: { role: "user", content: "request" },
    });
  });
});
