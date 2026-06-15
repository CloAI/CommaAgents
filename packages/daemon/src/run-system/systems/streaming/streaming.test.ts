import { describe, expect, it } from "bun:test";
import type { AgentCallResult, LoadedStrategy } from "@comma-agents/core";
import { createSystemRunContext } from "../systems.test.utils";
import type { StrategyLoadedContext } from "../systems.types";
import { createStreamingSystem } from "./streaming";

const result: AgentCallResult = {
  text: "response",
  usage: { promptTokens: 10, completionTokens: 5 },
  finishReason: "stop",
  responseMessages: [],
  steps: [],
};

describe("createStreamingSystem", () => {
  it("broadcasts through its hooks without a run store dependency", () => {
    const context = createSystemRunContext();
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
          config: {},
        },
      },
      raw: { agents: { assistant: { model: "mock/model" } } },
    } as unknown as LoadedStrategy;
    const strategyContext: StrategyLoadedContext = {
      ...context,
      strategy,
    };
    const system = createStreamingSystem({
      logger: context.logger,
      sink: context.sink,
    });

    system.onStrategyLoaded?.(strategyContext);

    const beforeStep = flowHooks.get("beforeStep") as (value: {
      stepName: string;
      message: string;
    }) => void;
    const afterStep = flowHooks.get("afterStep") as (value: {
      stepName: string;
      message: string;
      result: AgentCallResult;
    }) => void;
    const afterCallResult = agentHooks.get("afterCallResult") as (
      value: AgentCallResult,
    ) => void;

    beforeStep({ stepName: "assistant", message: "request" });
    afterStep({ stepName: "assistant", message: "request", result });
    afterCallResult(result);

    expect(
      context.sink.broadcasts.map((broadcast) => broadcast.message.type),
    ).toEqual(["step_started", "step_completed", "agent_output"]);
  });
});
