import type { QuestionValue } from "@comma-agents/core/questions";

/** Local draft retained when navigating or switching answer modes. */
export interface QuestionDraft {
  /** How the user intends to answer this whole question. */
  readonly type: "answered" | "other" | "skipped";
  /** Entered structured values; untouched fields are absent. */
  readonly values: Readonly<Record<string, QuestionValue>>;
  /** Alternative answer for the entire question. */
  readonly other: string;
}
