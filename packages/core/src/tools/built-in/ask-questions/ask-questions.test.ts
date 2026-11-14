import { describe, expect, it } from "vitest";
import { createAskQuestionsTool, askQuestionsParams } from "./ask-questions";
import { makeToolContext } from "../../test.utils";
import type { ToolContext } from "../../tool.types";

const questionnaire = askQuestionsParams.parse({
  questions: [
    {
      id: "scope",
      prompt: "What should I review?",
      fields: [{ id: "notes", type: "text", label: "Notes" }],
    },
  ],
});
const context: ToolContext = makeToolContext({
  agentName: "Reviewer",
  abort: new AbortController().signal,
});

describe("createAskQuestionsTool", () => {
  it("should send a whole questionnaire and return structured model-visible JSON", async () => {
    const response = {
      answers: [
        {
          questionId: "scope",
          type: "other" as const,
          text: "Only review deployment.",
        },
      ],
    };
    const result = await createAskQuestionsTool().execute(questionnaire, {
      ...context,
      requestQuestions: async (request) => {
        expect(request).toEqual({
          ...questionnaire,
          agentName: "Reviewer",
          toolName: "ask_questions",
          signal: context.abort,
        });
        return response;
      },
    });
    expect(result.data).toEqual(response);
    expect(JSON.parse(result.output)).toEqual(response);
  });
  it("should fail clearly without a runtime and reject invalid runtime answers", async () => {
    expect(
      (await createAskQuestionsTool().execute(questionnaire, context)).ok,
    ).toBe(false);
    expect(
      (
        await createAskQuestionsTool().execute(questionnaire, {
          ...context,
          requestQuestions: async () => ({
            answers: [{ questionId: "scope", type: "answered", values: {} }],
          }),
        })
      ).ok,
    ).toBe(false);
  });
});
