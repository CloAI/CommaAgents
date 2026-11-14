import type { z } from "zod";
import type {
  QuestionSchema,
  QuestionFieldSchema,
  QuestionsSchema,
  QuestionsResponseSchema,
} from "./questions";

/** One typed input within a composed question. */
export type QuestionField = Readonly<z.output<typeof QuestionFieldSchema>>;
/** A composed question with optional recommendation metadata. */
export type Question = Omit<
  Readonly<z.output<typeof QuestionSchema>>,
  "fields"
> & { readonly fields: readonly QuestionField[] };
/** Model-facing questionnaire before defaults are applied. */
export type QuestionsInput = z.input<typeof QuestionsSchema>;
/** Validated questionnaire with field defaults applied. */
export interface Questionnaire {
  /** Questions belonging to this single tool invocation. */
  readonly questions: readonly Question[];
}
/** Complete answers, overrides, and skips for one questionnaire. */
export interface QuestionsResponse {
  /** Exactly one final outcome for each requested question. */
  readonly answers: readonly QuestionAnswer[];
}
/** One question's final outcome. */
export type QuestionAnswer = Readonly<
  z.output<typeof QuestionsResponseSchema>["answers"][number]
>;
/** A structured field answer. */
export type QuestionValue = string | readonly string[] | number;

/** Runtime request for human input, independent of its presentation or transport. */
export interface QuestionsRequest extends Questionnaire {
  /** Agent requesting input. */
  readonly agentName: string;
  /** Tool requesting input. */
  readonly toolName: string;
  /** Explicit cancellation of the pending request. */
  readonly signal?: AbortSignal;
}

/** Present one questionnaire and await its complete response. */
export type QuestionsRequester = (
  request: QuestionsRequest,
) => Promise<QuestionsResponse>;

/** A request or response violation at a specific question or field. */
export interface QuestionIssue {
  /** Question containing the invalid value, when known. */
  readonly questionId?: string;
  /** Field containing the invalid value, when known. */
  readonly fieldId?: string;
  /** Human-readable validation failure. */
  readonly message: string;
}
