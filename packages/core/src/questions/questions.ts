import { z } from "zod";
import { fieldValueError } from "./questions.utils";
import type {
  Questionnaire,
  QuestionsResponse,
  QuestionIssue,
} from "./questions.types";

const IdentifierSchema = z.string().trim().min(1);
const FieldBase = {
  id: IdentifierSchema,
  label: z.string().min(1),
  description: z.string().optional(),
  required: z.boolean().default(true),
};
const TextFieldSchema = z
  .object({
    ...FieldBase,
    type: z.literal("text"),
    recommendation: z
      .object({ value: z.string(), explanation: z.string().min(1) })
      .strict()
      .optional(),
  })
  .strict();
const ChoiceFieldSchema = z
  .object({
    ...FieldBase,
    type: z.literal("choice"),
    options: z
      .array(
        z
          .object({
            id: IdentifierSchema,
            label: z.string().min(1),
            description: z.string().optional(),
          })
          .strict(),
      )
      .min(1),
    minSelections: z.number().int().nonnegative().default(1),
    maxSelections: z.number().int().positive().default(1),
    recommendation: z
      .object({ value: z.array(z.string()), explanation: z.string().min(1) })
      .strict()
      .optional(),
  })
  .strict();
const SliderFieldSchema = z
  .object({
    ...FieldBase,
    type: z.literal("slider"),
    min: z.number().finite(),
    max: z.number().finite(),
    step: z.number().finite().positive(),
    minLabel: z.string().optional(),
    maxLabel: z.string().optional(),
    recommendation: z
      .object({ value: z.number().finite(), explanation: z.string().min(1) })
      .strict()
      .optional(),
  })
  .strict();

/** Typed fields with optional recommendation metadata. */
export const QuestionFieldSchema = z.discriminatedUnion("type", [
  TextFieldSchema,
  ChoiceFieldSchema,
  SliderFieldSchema,
]);
/** One question whose structured answer can be replaced or skipped. */
export const QuestionSchema = z
  .object({
    id: IdentifierSchema,
    prompt: z.string().min(1),
    recommendation: z.string().optional(),
    fields: z.array(QuestionFieldSchema).min(1),
  })
  .strict();

/** One model invocation's complete questionnaire. */
export const QuestionsSchema = z
  .object({ questions: z.array(QuestionSchema).min(1) })
  .strict()
  .superRefine((questionnaire, context) => {
    const questionIds = new Set<string>();
    for (const [questionIndex, question] of questionnaire.questions.entries()) {
      if (questionIds.has(question.id)) {
        context.addIssue({
          code: "custom",
          path: ["questions", questionIndex, "id"],
          message: "Question IDs must be unique.",
        });
      }
      questionIds.add(question.id);
      const fieldIds = new Set<string>();
      for (const [fieldIndex, field] of question.fields.entries()) {
        const path = ["questions", questionIndex, "fields", fieldIndex];
        if (fieldIds.has(field.id)) {
          context.addIssue({
            code: "custom",
            path,
            message: "Field IDs must be unique within a question.",
          });
        }
        fieldIds.add(field.id);
        if (field.type === "choice") {
          if (
            new Set(field.options.map((option) => option.id)).size !==
            field.options.length
          ) {
            context.addIssue({
              code: "custom",
              path,
              message: "Option IDs must be unique.",
            });
          }
          if (
            field.minSelections > field.maxSelections ||
            field.maxSelections > field.options.length
          ) {
            context.addIssue({
              code: "custom",
              path,
              message: "Selection bounds must fit the available options.",
            });
          }
        }
        if (
          field.type === "slider" &&
          (field.min >= field.max ||
            !Number.isFinite((field.max - field.min) / field.step))
        ) {
          context.addIssue({
            code: "custom",
            path,
            message: "Slider bounds must define a finite increasing range.",
          });
        }
        if (field.recommendation) {
          const message = fieldValueError(field, field.recommendation.value);
          if (message) {
            context.addIssue({
              code: "custom",
              path: [...path, "recommendation"],
              message,
            });
          }
        }
      }
    }
  });

/** Complete structured, overridden, or skipped answers for one request. */
export const QuestionsResponseSchema = z
  .object({
    answers: z
      .array(
        z.discriminatedUnion("type", [
          z
            .object({
              questionId: IdentifierSchema,
              type: z.literal("answered"),
              values: z.record(
                z.union([z.string(), z.array(z.string()), z.number().finite()]),
              ),
            })
            .strict(),
          z
            .object({
              questionId: IdentifierSchema,
              type: z.literal("other"),
              text: z
                .string()
                .refine(
                  (text) => text.trim().length > 0,
                  "Enter an alternative answer.",
                ),
            })
            .strict(),
          z
            .object({
              questionId: IdentifierSchema,
              type: z.literal("skipped"),
            })
            .strict(),
        ]),
      )
      .min(1),
  })
  .strict();

/**
 * Validate a complete response against its original questionnaire.
 * @param {Questionnaire} questionnaire - Original validated questions and constraints.
 * @param {QuestionsResponse} response - Complete proposed answers.
 * @returns {readonly QuestionIssue[]} Violations; an empty array means the response is valid.
 * @example
 * const issues = validateQuestionsResponse(questionnaire, response);
 */
export function validateQuestionsResponse(
  questionnaire: Questionnaire,
  response: QuestionsResponse,
): readonly QuestionIssue[] {
  const issues: QuestionIssue[] = [];
  const answeredIds = new Set<string>();
  for (const answer of response.answers) {
    const question = questionnaire.questions.find(
      (candidate) => candidate.id === answer.questionId,
    );
    if (!question || answeredIds.has(answer.questionId)) {
      issues.push({
        questionId: answer.questionId,
        message: question
          ? "Answer each question only once."
          : "Unknown question.",
      });
      continue;
    }
    answeredIds.add(question.id);
    if (answer.type !== "answered") {
      continue;
    }
    for (const fieldId of Object.keys(answer.values)) {
      if (!question.fields.some((field) => field.id === fieldId)) {
        issues.push({
          questionId: question.id,
          fieldId,
          message: "Unknown field.",
        });
      }
    }
    for (const field of question.fields) {
      const value = answer.values[field.id];
      const message =
        value === undefined
          ? field.required
            ? "Answer this field."
            : undefined
          : fieldValueError(field, value);
      if (message) {
        issues.push({ questionId: question.id, fieldId: field.id, message });
      }
    }
  }
  for (const question of questionnaire.questions) {
    if (!answeredIds.has(question.id)) {
      issues.push({
        questionId: question.id,
        message: "Answer, override, or skip this question.",
      });
    }
  }
  return issues;
}
