import { describe, expect, it } from "bun:test";
import { makeToolContext } from "../../test.utils";
import type { ToolContext } from "../../tool.types";
import { createAskQuestionTool } from "./ask-question";

function makeCtx(overrides?: {
  onQuestion?: (request: {
    agentName: string;
    toolName: string;
    question: string;
  }) => Promise<string>;
  agentName?: string;
}): ToolContext {
  const mockGuard: any = {
    toolName: "ask_question",
    cwd: "",
    askQuestion: overrides?.onQuestion
      ? async (question: string, ctx: any) => {
          return overrides.onQuestion!({
            agentName: ctx.agentName,
            toolName: ctx.toolName,
            question,
          });
        }
      : undefined,
  };

  return makeToolContext({
    agentName: overrides?.agentName ?? "test-agent",
    sandbox: {
      cwd: "",
      guards: new Map(),
      guardFor: () => mockGuard,
    },
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
      onQuestion: async (req) => {
        expect(req.agentName).toBe("test-agent");
        expect(req.toolName).toBe("ask_question");
        expect(req.question).toBe("How are you?");
        return "Fine";
      },
    });

    const result = await tool.execute({ question: "How are you?" }, ctx);
    expect(result.ok).toBe(true);
    expect(result.data?.response).toBe("Fine");
    expect(result.output).toContain('User response: "Fine"');
  });

  it("returns an error if askQuestion callback is not available on guard", async () => {
    const tool = createAskQuestionTool();
    const ctx = makeCtx(); // No onQuestion supplied

    const result = await tool.execute({ question: "How are you?" }, ctx);
    expect(result.ok).toBe(false);
    expect(result.error?.message).toContain(
      "askQuestion callback is not available on guard",
    );
  });
});
