import { afterEach, describe, expect, it } from "bun:test";
import type { LanguageModel } from "ai";
import { z } from "zod";
import {
  createConversationContext,
  createConversationRecord,
} from "../../conversation-context";
import { registerModel, resetModelRegistry } from "../../model/model";
import { buildCallOptions } from "./agent.utils";

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
