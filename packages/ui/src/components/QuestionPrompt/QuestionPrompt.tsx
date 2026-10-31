import { useCallback, useState } from "react";
import { Button } from "../../design-system/Button";
import { TextArea } from "../../design-system/TextArea";
import { useDaemonMutation } from "../../hooks/useDaemonMutation";
import type { PendingQuestion } from "../../hooks/usePendingQuestions";
import styles from "./QuestionPrompt.module.scss";

/** A question an agent is waiting on. */
export interface QuestionPromptProps {
  /** Question to show and answer. */
  readonly question: PendingQuestion;
}

/**
 * Show an agent's question and send the user's answer to the daemon.
 * @param {QuestionPromptProps} props - Component properties.
 * @returns {React.ReactElement} The question with its answer controls.
 */
export function QuestionPrompt({ question }: QuestionPromptProps) {
  const [error, setError] = useState<string>();
  const { mutate, isLoading } = useDaemonMutation("questions.answer");
  const answer = useCallback(
    async (response: string): Promise<void> => {
      setError(undefined);
      try {
        const result = await mutate({
          runId: question.runId,
          requestId: question.requestId,
          response,
        });
        if (!result.answered)
          setError("This question was already answered or cancelled.");
      } catch (answerError) {
        setError(
          answerError instanceof Error
            ? answerError.message
            : "The answer could not be sent.",
        );
      }
    },
    [mutate, question.runId, question.requestId],
  );
  return (
    <QuestionPromptRender
      question={question}
      busy={isLoading}
      error={error}
      onAnswer={answer}
    />
  );
}

/** Question content and answer actions. */
export interface QuestionPromptRenderProps {
  /** Question to show. */
  readonly question: PendingQuestion;
  /** Whether an answer is being sent. */
  readonly busy: boolean;
  /** Why the last answer failed. */
  readonly error?: string;
  /** Send an answer. */
  readonly onAnswer: (response: string) => void;
}

/**
 * Render a question card; a strategy-switch request gets approve and decline actions.
 * @param {QuestionPromptRenderProps} props - Component properties.
 * @returns {React.ReactElement} The question card.
 */
export function QuestionPromptRender({
  question,
  busy,
  error,
  onAnswer,
}: QuestionPromptRenderProps) {
  const [draft, setDraft] = useState("");
  const isSwitch = question.toolName === "request_strategy_switch";
  return (
    <section
      className={styles.questionPrompt}
      aria-label={`Question from ${question.agentName}`}
    >
      <header className={styles.header}>
        <strong>{question.agentName}</strong>
        <span className={styles.tool}>
          {isSwitch ? "wants to switch strategy" : "asks"}
        </span>
      </header>
      <p className={styles.question}>{question.question}</p>
      <form
        className={styles.answer}
        onSubmit={(event) => {
          event.preventDefault();
          if (draft.trim().length > 0) onAnswer(draft.trim());
        }}
      >
        {isSwitch && (
          <div className={styles.actions}>
            <Button disabled={busy} onClick={() => onAnswer("yes")}>
              Switch
            </Button>
            <Button disabled={busy} onClick={() => onAnswer("no")}>
              Not now
            </Button>
          </div>
        )}
        <TextArea
          aria-label={isSwitch ? "Reply instead" : "Your answer"}
          placeholder={
            isSwitch ? "Or reply with feedback..." : "Your answer..."
          }
          rows={2}
          value={draft}
          disabled={busy}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              event.currentTarget.form?.requestSubmit();
            }
          }}
        />
        <div className={styles.actions}>
          <Button type="submit" disabled={busy || draft.trim().length === 0}>
            {isSwitch ? "Send reply" : "Answer"}
          </Button>
        </div>
      </form>
      {error && <p role="alert">{error}</p>}
    </section>
  );
}
