import { BUILT_IN_TOOL_NAMES } from "../../tools/tool.constants";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { LanguageModel } from "ai";
import { z } from "zod";
import {
  createConversationContext,
  createConversationRecord,
} from "../../conversation-context";
import { registerModel, resetModelRegistry } from "../../model/model";
import { buildCallOptions, buildAgentToolSet } from "./agent.utils";
import { defineTool } from "../../tools/define/define-tool";
import { okResult } from "../../tools/result";

describe("buildCallOptions output schema", () => {
  afterEach(() => {
    resetModelRegistry();
  });

  it("passes an AgentConfig outputSchema to streamText as object output", async () => {
    registerModel("mock/structured", {
      modelId: "structured",
      provider: "mock",
      specificationVersion: "v3",
    } as LanguageModel);

    const result = await buildCallOptions(
      {
        name: "structured",
        model: "mock/structured",
        outputSchema: z.object({ answer: z.string() }),
      },
      {},
      "Answer the question",
      createConversationContext(),
    );

    expect(await result.callOptions.output?.responseFormat).toMatchObject({
      type: "json",
      schema: {
        type: "object",
        properties: { answer: { type: "string" } },
        required: ["answer"],
      },
    });
  });
});

describe("buildCallOptions context retention", () => {
  afterEach(() => {
    resetModelRegistry();
  });

  it("prepares context so the message list is bounded while history is kept", async () => {
    registerModel("mock/windowed", {
      modelId: "windowed",
      provider: "mock",
      specificationVersion: "v3",
    } as LanguageModel);

    const context = createConversationContext({
      rollingWindow: 1,
    });
    context.importRecords([
      createConversationRecord({
        id: "1",
        agentName: "writer",
        userMessage: "first",
        responseMessages: [{ role: "assistant", content: "one" }],
        text: "one",
        usage: { promptTokens: 1, completionTokens: 1 },
        finishReason: "stop",
      }),
      createConversationRecord({
        id: "2",
        agentName: "writer",
        userMessage: "second",
        responseMessages: [{ role: "assistant", content: "two" }],
        text: "two",
        usage: { promptTokens: 1, completionTokens: 1 },
        finishReason: "stop",
      }),
    ]);

    const result = await buildCallOptions(
      { name: "writer", model: "mock/windowed" },
      {},
      "third",
      context,
    );

    // Only the windowed record (record 2) plus the new user message survive.
    expect(result.callOptions.messages).toEqual([
      { role: "user", content: "second" },
      { role: "assistant", content: "two" },
      { role: "user", content: "third" },
    ]);
    // Full history is retained; the dropped record is tombstoned, not deleted.
    expect(context.exportRecords()).toHaveLength(2);
    expect(context.exportRecords()[0]).toMatchObject({
      id: "1",
      status: "superseded",
    });
  });
});

describe("default agent tools", () => {
  afterEach(resetModelRegistry);
  it("should provide built-ins by default and honor explicit empty or restricted lists", async () => {
    registerModel("mock/tools", {
      modelId: "tools",
      provider: "mock",
      specificationVersion: "v3",
    } as LanguageModel);
    const defaults = await buildCallOptions(
      { name: "defaults", model: "mock/tools" },
      {},
      "Hello",
      createConversationContext(),
    );
    expect(Object.keys(defaults.callOptions.tools ?? {}).sort()).toEqual(
      [...BUILT_IN_TOOL_NAMES].sort(),
    );
    const empty = await buildCallOptions(
      { name: "empty", model: "mock/tools", tools: [] },
      {},
      "Hello",
      createConversationContext(),
    );
    expect(Object.keys(empty.callOptions.tools ?? {})).toEqual([]);
    const limited = await buildCallOptions(
      { name: "limited", model: "mock/tools", tools: ["search_skills"] },
      {},
      "Hello",
      createConversationContext(),
    );
    expect(Object.keys(limited.callOptions.tools ?? {})).toEqual([
      "search_skills",
    ]);
  });
});

describe("tool cancellation", () => {
  it("should keep human interaction pending without an implicit timeout and preserve explicit cancellation", async () => {
    vi.useFakeTimers();
    try {
      const signals: AbortSignal[] = [];
      const tools = buildAgentToolSet({
        agentName: "Reviewer",
        toolDefinitions: {
          question: defineTool({
            description: "Ask",
            parameters: z.object({}),
            execute: async (_arguments, context) => {
              signals.push(context.abort);
              return okResult("captured");
            },
          }),
        },
      });
      const tool = tools?.question;
      if (!tool?.execute) {
        throw new Error("Expected question tool");
      }
      await tool.execute({}, { toolCallId: "first", messages: [] });
      await vi.advanceTimersByTimeAsync(60000);
      expect(signals[0]?.aborted).toBe(false);
      const controller = new AbortController();
      await tool.execute(
        {},
        { toolCallId: "second", messages: [], abortSignal: controller.signal },
      );
      controller.abort();
      expect(signals[1]).toBe(controller.signal);
      expect(signals[1]?.aborted).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });
});
