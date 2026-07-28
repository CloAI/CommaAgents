import { describe, expect, it } from "bun:test";
import {
  type AgentCallResult,
  type AgentStreamEvent,
  createConversationContext,
  createConversationRecord,
  type LoadedStrategy,
} from "@comma-agents/core";
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
    const conversationContext = createConversationContext();
    const record = createConversationRecord({
      id: "record-1",
      agentName: "assistant",
      createdAt: "2026-01-01T00:00:00.000Z",
      userMessage: "request",
      responseMessages: result.responseMessages,
      text: result.text,
      usage: result.usage,
      finishReason: result.finishReason,
    });
    conversationContext.appendRecord(record);
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
          getConversationContext(): typeof conversationContext {
            return conversationContext;
          },
          name: "assistant",
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
    const afterCallResult = agentHooks.get("afterCallResult") as (
      value: AgentCallResult,
    ) => void;
    const onStreamEvent = agentHooks.get("onStreamEvent") as (
      value: AgentStreamEvent,
    ) => void;

    beforeStep({ stepName: "assistant", message: "request" });
    afterStep({ stepName: "assistant", message: "request", result });
    onStreamEvent({
      type: "retention",
      event: {
        id: "retention-1",
        agentName: "assistant",
        createdAt: "2026-01-01T00:00:01.000Z",
        kind: "compaction",
        reason: "context-window",
        trigger: {
          contextUsage: { totalTokens: 850 },
          tokenLimit: 1_000,
          ratio: 0.85,
          thresholdRatio: 0.85,
        },
        recordsCompacted: 1,
        recordsRetained: 1,
        summaryRecord: {
          ...record,
          id: "summary-1",
          text: "summary",
          usage: { promptTokens: 0, completionTokens: 0 },
          status: "active",
        },
        supersededRecordIds: ["record-1"],
      },
    });
    afterCallResult(result);

    const events = await runStore.getEvents(context.run.id);
    expect(events.map((event) => event.type)).toEqual([
      "run_started",
      "step_started",
      "step_completed",
      "conversation_retention",
      "agent_call",
    ]);
    expect(events[0]).toMatchObject({
      type: "run_started",
      initialInput: "initial input",
    });
    expect(events[3]).toMatchObject({
      type: "conversation_retention",
      event: { id: "retention-1" },
    });
    expect(events[4]).toMatchObject({
      type: "agent_call",
      record: {
        agentName: "assistant",
        userMessage: { role: "user", content: "request" },
      },
    });
  });
});
