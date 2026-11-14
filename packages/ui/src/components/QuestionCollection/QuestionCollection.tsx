import {
  QuestionsResponseSchema,
  validateQuestionsResponse,
} from "@comma-agents/core/questions";
import { useCallback, useId, useRef, useState } from "react";
import type {
  QuestionAnswer,
  QuestionField,
  QuestionIssue,
  QuestionsResponse,
  QuestionValue,
} from "@comma-agents/core/questions";
import { ChevronsLeft, ChevronsRight } from "lucide-react";
import { Button } from "../../design-system/Button";
import { IconButton } from "../../design-system/IconButton";
import { Slider } from "../../design-system/Slider";
import { TextArea } from "../../design-system/TextArea";
import { useDaemonMutation } from "../../hooks/useDaemonMutation";
import type { PendingQuestion } from "../../hooks/usePendingQuestions";
import type { QuestionDraft } from "./QuestionCollection.types";
import styles from "./QuestionCollection.module.scss";

/** Pending questionnaires, each belonging to one tool invocation. */
export interface QuestionCollectionProps {
  /** Independent requests from this run and its agents. */
  readonly questions: readonly PendingQuestion[];
}

/**
 * Render each pending tool questionnaire as its own submission boundary.
 * @param {QuestionCollectionProps} props - Pending tool requests.
 * @returns {React.ReactElement} Independent questionnaire collections.
 */
export function QuestionCollection({ questions }: QuestionCollectionProps) {
  return (
    <>
      {questions.map((request) => (
        <QuestionnaireRequest
          key={`${request.runId}:${request.requestId}`}
          request={request}
        />
      ))}
    </>
  );
}

interface QuestionnaireRequestProps {
  /** Tool invocation whose complete response is submitted together. */
  readonly request: PendingQuestion;
}

/**
 * Own the daemon submission and retry identity for one pending questionnaire.
 * @param {QuestionnaireRequestProps} props - Pending tool request.
 * @returns {React.ReactElement} The questionnaire and submission controls.
 */
function QuestionnaireRequest({ request }: QuestionnaireRequestProps) {
  const submission = useRef<
    { readonly content: string; readonly id: string } | undefined
  >(undefined);
  const { attempt, isLoading } = useDaemonMutation("questions.submit");
  const submit = useCallback(
    async (response: QuestionsResponse): Promise<readonly QuestionIssue[]> => {
      const parsed = QuestionsResponseSchema.safeParse(response);
      if (!parsed.success) {
        return parsed.error.issues.map((issue) => ({
          questionId:
            typeof issue.path[1] === "number"
              ? response.answers[issue.path[1]]?.questionId
              : undefined,
          fieldId:
            issue.path[2] === "values" && typeof issue.path[3] === "string"
              ? issue.path[3]
              : undefined,
          message: issue.message,
        }));
      }
      const violations = validateQuestionsResponse(
        { questions: request.questions },
        parsed.data,
      );
      if (violations.length > 0) {
        return violations;
      }
      const content = JSON.stringify(parsed.data);
      if (submission.current?.content !== content) {
        submission.current = { content, id: crypto.randomUUID() };
      }
      const result = await attempt({
        runId: request.runId,
        requestId: request.requestId,
        submissionId: submission.current.id,
        response: parsed.data,
      });
      if (!result.ok) {
        throw new Error(result.error.message);
      }
      return [];
    },
    [attempt, request.runId, request.requestId, request.questions],
  );
  return (
    <QuestionCollectionRender
      request={request}
      busy={isLoading}
      onSubmit={submit}
    />
  );
}

/** One tool invocation's questionnaire and final submission action. */
export interface QuestionCollectionRenderProps {
  /** Request identity and its ordered composed questions. */
  readonly request: PendingQuestion;
  /** Whether the complete response is being sent. */
  readonly busy: boolean;
  /** Last transport or server failure; drafts remain editable. */
  readonly error?: string;
  /** Validate and submit the complete questionnaire, returning field issues if rejected. */
  readonly onSubmit: (
    response: QuestionsResponse,
  ) => Promise<readonly QuestionIssue[]>;
}

/**
 * Page through composed questions while keeping every draft until final submission.
 * @param {QuestionCollectionRenderProps} props - Request and submission state.
 * @returns {React.ReactElement | null} The questionnaire, or nothing for an empty request.
 */
export function QuestionCollectionRender({
  request,
  busy,
  error,
  onSubmit,
}: QuestionCollectionRenderProps) {
  const [activeIndex, setActiveIndex] = useState(0);
  const [drafts, setDrafts] = useState<ReadonlyMap<string, QuestionDraft>>(
    new Map(),
  );
  const [issues, setIssues] = useState<readonly QuestionIssue[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [submissionError, setSubmissionError] = useState<string>();
  const disabled = busy || submitting || submitted;
  const question = request.questions[activeIndex];

  const changeDraft = useCallback(
    (questionId: string, update: Partial<QuestionDraft>) => {
      setDrafts((previous) => {
        const next = new Map(previous);
        next.set(questionId, {
          type: "answered",
          values: {},
          other: "",
          ...previous.get(questionId),
          ...update,
        });
        return next;
      });
      setIssues([]);
      setSubmissionError(undefined);
    },
    [],
  );
  const changeValue = useCallback(
    (questionId: string, fieldId: string, value: QuestionValue | undefined) => {
      setDrafts((previous) => {
        const draft = previous.get(questionId) ?? {
          type: "answered",
          values: {},
          other: "",
        };
        const values = { ...draft.values };
        if (value === undefined) {
          delete values[fieldId];
        } else {
          values[fieldId] = value;
        }
        return new Map(previous).set(questionId, { ...draft, values });
      });
      setIssues([]);
      setSubmissionError(undefined);
    },
    [],
  );
  const submit = useCallback(async () => {
    const answers: QuestionAnswer[] = request.questions.map((question) => {
      const draft = drafts.get(question.id);
      if (draft?.type === "skipped") {
        return { questionId: question.id, type: "skipped" };
      }
      if (draft?.type === "other") {
        return { questionId: question.id, type: "other", text: draft.other };
      }
      const values: Record<string, string | string[] | number> = {};
      for (const field of question.fields) {
        const value = draft?.values[field.id];
        if (
          value !== undefined &&
          (field.required ||
            (typeof value === "string"
              ? value.length > 0
              : !Array.isArray(value) || value.length > 0))
        ) {
          values[field.id] = Array.isArray(value)
            ? [...value]
            : (value as string | number);
        }
      }
      return { questionId: question.id, type: "answered", values };
    });
    setSubmitting(true);
    setSubmissionError(undefined);
    try {
      const violations = await onSubmit({ answers });
      setIssues(violations);
      if (violations.length > 0) {
        const invalidIndex = request.questions.findIndex(
          (question) => question.id === violations[0]?.questionId,
        );
        if (invalidIndex >= 0) {
          setActiveIndex(invalidIndex);
        }
      } else {
        setSubmitted(true);
      }
    } catch (failure) {
      setSubmissionError(
        failure instanceof Error
          ? failure.message
          : "Could not submit answers. Try again.",
      );
    } finally {
      setSubmitting(false);
    }
  }, [drafts, onSubmit, request.questions]);

  if (!question) {
    return null;
  }
  const draft = drafts.get(question.id);
  const mode = draft?.type ?? "answered";
  return (
    <section
      className={styles.questionCollection}
      aria-label={`Questions from ${request.agentName}`}
    >
      <header className={styles.header}>
        <strong>{request.agentName}</strong>
        <span className={styles.tool}>
          {request.toolName === "request_strategy_switch"
            ? "wants to switch strategy"
            : "asks"}
        </span>
        {request.questions.length > 1 && (
          <nav className={styles.pager} aria-label="Question navigation">
            <IconButton
              label="Previous question"
              onClick={() =>
                setActiveIndex(
                  (activeIndex + request.questions.length - 1) %
                    request.questions.length,
                )
              }
            >
              <ChevronsLeft />
            </IconButton>
            <span aria-label="Question count" aria-live="polite">
              {activeIndex + 1}/{request.questions.length}
            </span>
            <IconButton
              label="Next question"
              onClick={() =>
                setActiveIndex((activeIndex + 1) % request.questions.length)
              }
            >
              <ChevronsRight />
            </IconButton>
          </nav>
        )}
      </header>
      <p className={styles.question}>{question.prompt}</p>
      {question.recommendation && (
        <p className={styles.recommendation}>{question.recommendation}</p>
      )}
      <div className={styles.actions} role="group" aria-label="Answer mode">
        <Button
          disabled={disabled}
          aria-pressed={mode === "answered"}
          onClick={() => changeDraft(question.id, { type: "answered" })}
        >
          Answer fields
        </Button>
        <Button
          disabled={disabled}
          aria-pressed={mode === "other"}
          onClick={() => changeDraft(question.id, { type: "other" })}
        >
          Other
        </Button>
        <Button
          disabled={disabled}
          aria-pressed={mode === "skipped"}
          onClick={() => changeDraft(question.id, { type: "skipped" })}
        >
          Skip question
        </Button>
      </div>
      {mode === "skipped" ? (
        <p>This question will be skipped when you submit.</p>
      ) : mode === "other" ? (
        <TextArea
          aria-label="Other answer"
          rows={3}
          disabled={disabled}
          value={draft?.other ?? ""}
          placeholder="Answer this question in your own words..."
          onChange={(event) =>
            changeDraft(question.id, { other: event.target.value })
          }
        />
      ) : (
        question.fields.map((field) => (
          <QuestionFieldInput
            key={`${question.id}:${field.id}`}
            field={field}
            value={draft?.values[field.id]}
            disabled={disabled}
            onChange={(value) => changeValue(question.id, field.id, value)}
          />
        ))
      )}
      {issues
        .filter(
          (issue) =>
            issue.questionId === undefined || issue.questionId === question.id,
        )
        .map((issue, issueIndex) => (
          <p key={issueIndex} role="alert">
            {issue.fieldId
              ? `${question.fields.find((field) => field.id === issue.fieldId)?.label ?? issue.fieldId}: `
              : ""}
            {issue.message}
          </p>
        ))}
      {(error || submissionError) && (
        <p role="alert">{error ?? submissionError}</p>
      )}
      {submitted && !error && <p role="status">Answers submitted.</p>}
      <Button disabled={disabled} onClick={() => void submit()}>
        {submitted
          ? "Submitted"
          : busy || submitting
            ? "Submitting..."
            : "Submit answers"}
      </Button>
    </section>
  );
}

interface QuestionFieldInputProps {
  /** Field definition, including optional recommendation metadata. */
  readonly field: QuestionField;
  /** Entered value; undefined means untouched, including sliders. */
  readonly value?: QuestionValue;
  /** Whether submission prevents further editing. */
  readonly disabled: boolean;
  /** Change this field's local draft. */
  readonly onChange: (value: QuestionValue | undefined) => void;
}

/**
 * Render a typed field while keeping recommendations separate from entered values.
 * @param {QuestionFieldInputProps} props - Definition and local draft value.
 * @returns {React.ReactElement} Typed field controls.
 */
function QuestionFieldInput({
  field,
  value,
  disabled,
  onChange,
}: QuestionFieldInputProps) {
  const groupId = useId();
  return (
    <fieldset className={styles.field} disabled={disabled}>
      <legend>
        {field.label}
        {!field.required && " (optional)"}
      </legend>
      {field.description && <p>{field.description}</p>}
      {field.type === "text" ? (
        <TextArea
          aria-label={field.label}
          rows={3}
          value={typeof value === "string" ? value : ""}
          placeholder={field.recommendation?.value ?? "Your answer..."}
          onChange={(event) => onChange(event.target.value)}
        />
      ) : field.type === "choice" ? (
        field.options.map((option) => {
          const selected = typeof value === "object" ? value : [];
          const recommended = field.recommendation?.value.includes(option.id);
          return (
            <label
              key={option.id}
              className={styles.option}
              data-recommended={recommended || undefined}
            >
              <input
                type={field.maxSelections === 1 ? "radio" : "checkbox"}
                name={groupId}
                checked={selected.includes(option.id)}
                onChange={(event) =>
                  onChange(
                    field.maxSelections === 1
                      ? [option.id]
                      : event.target.checked
                        ? [...selected, option.id]
                        : selected.filter(
                            (selection) => selection !== option.id,
                          ),
                  )
                }
              />
              <span>
                {option.label}
                {recommended && <small>Recommended</small>}
                {option.description && <small>{option.description}</small>}
              </span>
            </label>
          );
        })
      ) : (
        <>
          <Slider
            aria-label={field.label}
            value={typeof value === "number" ? value : field.min}
            min={field.min}
            max={field.max}
            step={field.step}
            onValueChange={onChange}
          />
          <div className={styles.sliderLabels}>
            <span>{field.minLabel ?? field.min}</span>
            <output aria-label={`${field.label} value`}>
              {typeof value === "number" ? value : "Not answered"}
            </output>
            <span>{field.maxLabel ?? field.max}</span>
          </div>
          <Button
            onClick={() =>
              onChange(typeof value === "number" ? value : field.min)
            }
          >
            Use displayed value
          </Button>
        </>
      )}
      {field.type === "choice" && field.minSelections === 0 && (
        <Button onClick={() => onChange([])}>
          Select none for {field.label}
        </Button>
      )}
      {!field.required && value !== undefined && (
        <Button onClick={() => onChange(undefined)}>Clear {field.label}</Button>
      )}
      {field.recommendation && (
        <div className={styles.recommendation}>
          {field.type === "slider" && (
            <p>Suggested value: {field.recommendation.value}</p>
          )}
          <p>{field.recommendation.explanation}</p>
          <Button onClick={() => onChange(field.recommendation!.value)}>
            Use recommendation for {field.label}
          </Button>
        </div>
      )}
    </fieldset>
  );
}
