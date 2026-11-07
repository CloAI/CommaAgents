import { describe, expect, it } from "vitest";
import { makeToolContext } from "../../test.utils";
import type { ToolContext } from "../../tool.types";
import { createAskQuestionTool } from "./ask-question";

function makeCtx(overrides?: {
  requestQuestion?: (request: {
    agentName: string;
    toolName: string;
    question: string;
  }) => Promise<string>;
  agentName?: string;
}): ToolContext {
  return makeToolContext({
    agentName: overrides?.agentName ?? "test-agent",
    requestQuestion: overrides?.requestQuestion,
  });
}

describe("createAskQuestionTool", () => {
  it("returns a tool definition", () => {
    const tool = createAskQuestionTool();
    expect(tool.description.length).toBeGreaterThan(0);
    expect(typeof tool.execute).toBe("function");
  });

  it("successfully asks a question and receives user response", async () => {
    const tool = createAskQuestionTool();
    const ctx = makeCtx({
      requestQuestion: async (request) => {
        expect(request.agentName).toBe("test-agent");
        expect(request.toolName).toBe("ask_question");
        expect(request.question).toBe("How are you?");
        return "Fine";
      },
    });

    const result = await tool.execute({ question: "How are you?" }, ctx);
    expect(result.ok).toBe(true);
    expect(result.data?.response).toBe("Fine");
    expect(result.output).toContain('User response: "Fine"');
  });

  it("returns an error if a question requester is not available", async () => {
    const tool = createAskQuestionTool();
    const ctx = makeCtx();

    const result = await tool.execute({ question: "How are you?" }, ctx);
    expect(result.ok).toBe(false);
    expect(result.error?.message).toContain(
      "Question requester is not available",
    );
  });
});
