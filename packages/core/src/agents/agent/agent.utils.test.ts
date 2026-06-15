import { afterEach, describe, expect, it } from "bun:test";
import type { LanguageModel } from "ai";
import { z } from "zod";
import { createConversationContext } from "../../context/conversation-context";
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

    const options = await buildCallOptions(
      {
        name: "structured",
        model: "mock/structured",
        outputSchema: z.object({ answer: z.string() }),
      },
      "Answer the question",
      createConversationContext(),
    );

    expect(await options.output?.responseFormat).toMatchObject({
      type: "json",
      schema: {
        type: "object",
        properties: { answer: { type: "string" } },
        required: ["answer"],
      },
    });
  });
});
