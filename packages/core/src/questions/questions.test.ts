import { describe, expect, it } from "vitest";
import {
  QuestionsSchema,
  QuestionsResponseSchema,
  validateQuestionsResponse,
} from "./questions";

const questionnaire = QuestionsSchema.parse({
  questions: [
    {
      id: "review",
      prompt: "What should I review?",
      fields: [
        { id: "notes", type: "text", label: "Notes" },
        {
          id: "areas",
          type: "choice",
          label: "Areas",
          options: [
            { id: "core", label: "Core" },
            { id: "daemon", label: "Daemon" },
          ],
          maxSelections: 2,
        },
        {
          id: "confidence",
          type: "slider",
          label: "Confidence",
          min: 0,
          max: 1,
          step: 0.1,
        },
        { id: "extra", type: "text", label: "Extra", required: false },
      ],
    },
  ],
});

describe("questions", () => {
  it("should accept mixed typed answers and preserve text exactly", () => {
    const response = QuestionsResponseSchema.parse({
      answers: [
        {
          questionId: "review",
          type: "answered",
          values: {
            notes: "  Review\nthese areas.  ",
            areas: ["core", "daemon"],
            confidence: 0.3,
          },
        },
      ],
    });
    expect(validateQuestionsResponse(questionnaire, response)).toEqual([]);
    expect(response.answers[0]).toMatchObject({
      values: { notes: "  Review\nthese areas.  " },
    });
  });
  it("should require one outcome per question and reject duplicates and unknown fields", () => {
    expect(validateQuestionsResponse(questionnaire, { answers: [] })).toEqual([
      {
        questionId: "review",
        message: "Answer, override, or skip this question.",
      },
    ]);
    expect(
      validateQuestionsResponse(questionnaire, {
        answers: [
          { questionId: "review", type: "skipped" },
          { questionId: "review", type: "skipped" },
        ],
      }),
    ).toHaveLength(1);
    expect(
      validateQuestionsResponse(questionnaire, {
        answers: [
          { questionId: "review", type: "answered", values: { unknown: "x" } },
        ],
      }),
    ).toHaveLength(4);
  });
  it("should allow Other or Skip to replace an entire composed answer", () => {
    for (const answer of [
      { questionId: "review", type: "other", text: "Only deployment scripts." },
      { questionId: "review", type: "skipped" },
    ]) {
      expect(
        validateQuestionsResponse(
          questionnaire,
          QuestionsResponseSchema.parse({ answers: [answer] }),
        ),
      ).toEqual([]);
    }
    expect(
      QuestionsResponseSchema.safeParse({
        answers: [{ questionId: "review", type: "other", text: "  " }],
      }).success,
    ).toBe(false);
  });
  it("should report every invalid field without accepting a partial answer", () => {
    const issues = validateQuestionsResponse(questionnaire, {
      answers: [
        {
          questionId: "review",
          type: "answered",
          values: { notes: "  ", areas: ["core", "core"], confidence: 0.25 },
        },
      ],
    });
    expect(issues.map((issue) => issue.fieldId)).toEqual([
      "notes",
      "areas",
      "confidence",
    ]);
    expect(
      validateQuestionsResponse(questionnaire, {
        answers: [
          {
            questionId: "review",
            type: "answered",
            values: { notes: "x", areas: ["unknown"], confidence: 2 },
          },
        ],
      }),
    ).toHaveLength(2);
  });
  it("should reject invalid bounds, duplicate identifiers, and invalid recommendations", () => {
    const question = questionnaire.questions[0]!;
    expect(
      QuestionsSchema.safeParse({ questions: [question, question] }).success,
    ).toBe(false);
    expect(
      QuestionsSchema.safeParse({
        questions: [
          { ...question, fields: [question.fields[0], question.fields[0]] },
        ],
      }).success,
    ).toBe(false);
    for (const field of [
      { id: "value", label: "Value", type: "slider", min: 2, max: 1, step: 1 },
      {
        id: "value",
        label: "Value",
        type: "slider",
        min: 0,
        max: 1,
        step: 0.1,
        recommendation: { value: 0.25, explanation: "Suggested" },
      },
      {
        id: "value",
        label: "Value",
        type: "choice",
        options: [{ id: "a", label: "A" }],
        minSelections: 2,
      },
      {
        id: "value",
        label: "Value",
        type: "choice",
        options: [{ id: "a", label: "A" }],
        recommendation: { value: ["unknown"], explanation: "Suggested" },
      },
    ]) {
      expect(
        QuestionsSchema.safeParse({
          questions: [{ id: "question", prompt: "Choose", fields: [field] }],
        }).success,
      ).toBe(false);
    }
  });
});

it("should reject off-step values even when a slider has many increments", () => {
  const questionnaire = QuestionsSchema.parse({
    questions: [
      {
        id: "rating",
        prompt: "Rate",
        fields: [
          {
            id: "value",
            type: "slider",
            label: "Value",
            min: 0,
            max: 100000000,
            step: 1,
          },
        ],
      },
    ],
  });
  expect(
    validateQuestionsResponse(questionnaire, {
      answers: [
        {
          questionId: "rating",
          type: "answered",
          values: { value: 50000000.25 },
        },
      ],
    }),
  ).toHaveLength(1);
});

it("should accept representable decimal values on fine slider steps", () => {
  const questionnaire = QuestionsSchema.parse({
    questions: [
      {
        id: "rating",
        prompt: "Rate",
        fields: [
          {
            id: "value",
            type: "slider",
            label: "Value",
            min: 0,
            max: 1,
            step: 1e-9,
          },
        ],
      },
    ],
  });
  for (const value of [0.29, 0.57, 0.71]) {
    expect(
      validateQuestionsResponse(questionnaire, {
        answers: [
          { questionId: "rating", type: "answered", values: { value } },
        ],
      }),
    ).toEqual([]);
  }
});
