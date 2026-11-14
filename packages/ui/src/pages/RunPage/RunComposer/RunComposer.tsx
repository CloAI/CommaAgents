import { useState } from "react";
import { ChatComposer } from "../../../components/ChatComposer";
import type { ChatComposerWarning } from "../../../components/ChatComposer";
import { ChatInput } from "../../../components/ChatInput";
import { ContextOverflowDialog } from "../../../components/ContextOverflowDialog";
import { QuestionCollection } from "../../../components/QuestionCollection";
import { RecipientSelect } from "../../../components/RecipientSelect";
import { StrategyModels } from "../../../components/StrategyModels";
import { StrategySelectRender } from "../../../components/StrategySelect";
import { StrategySwitchDialog } from "../../../components/StrategySwitchDialog";
import {
  useRunComposer,
  useRunFeed,
  useRunStop,
  useRunStrategy,
  useRunSubmission,
} from "../../../hooks/runs";
import type {
  RunComposer as ComposerState,
  RunStrategy,
  RunSubmission,
  RunStop,
} from "../../../hooks/runs";
import { useDaemonConnectionStatus } from "../../../hooks/useCommaAgentsDaemon";
import { usePendingQuestions } from "../../../hooks/usePendingQuestions";
import type { PendingQuestion } from "../../../hooks/usePendingQuestions";
import { COMPOSER_PLACEHOLDERS } from "../RunPage.constants";
import { StopControlRender } from "../StopControl";
import styles from "../RunPage.module.scss";

/** The run being composed for. */
export interface RunComposerProps {
  /** Run whose agents' questions are shown. */
  readonly runId: string;
}

/**
 * Send messages to the run and change its strategy, with any problems shown above and the decisions either needs.
 * @param {RunComposerProps} props - Component properties.
 * @returns {React.ReactElement} The composer and strategy controls.
 */
export function RunComposer({ runId }: RunComposerProps) {
  const { snapshot } = useRunFeed();
  const composer = useRunComposer();
  const strategy = useRunStrategy();
  const stop = useRunStop();
  const submission = useRunSubmission();
  const questions = usePendingQuestions(runId);
  const connected = useDaemonConnectionStatus() === "connected";
  return (
    <RunComposerRender
      composer={composer}
      strategy={strategy}
      submission={submission}
      connected={connected}
      savedStrategyName={
        snapshot
          ? (snapshot.strategy?.name ?? snapshot.configuration.strategyPath)
          : undefined
      }
      stop={stop}
      questions={questions}
      modelRoles={snapshot?.configuration.modelRoles ?? {}}
    />
  );
}

/** Run-owned state needed to render the composer. */
export interface RunComposerRenderProps {
  /** Mode, recipients, submission gate, and message actions. */
  readonly composer: ComposerState;
  /** Discovered strategies and strategy-switch actions. */
  readonly strategy: RunStrategy;
  /** Context decisions and pending submission state. */
  readonly submission: RunSubmission;
  /** Whether the shared daemon connection is available. */
  readonly connected: boolean;
  /** Saved strategy's name or path, once the run snapshot arrives. */
  readonly savedStrategyName?: string;
  /** Availability, action, and failure of the run's stop control. */
  readonly stop: RunStop;
  /** Pending questions from this run's agents. */
  readonly questions: readonly PendingQuestion[];
  /** This conversation's model-role overrides. */
  readonly modelRoles: Readonly<Record<string, string>>;
}

/**
 * Render the run's message editor, strategy decisions, and notices from run-owned state.
 * @param {RunComposerRenderProps} props - Run state and interaction callbacks.
 * @returns {React.ReactElement} The composer and its decision dialogs.
 */
export function RunComposerRender({
  composer,
  strategy,
  submission,
  connected,
  savedStrategyName,
  stop,
  questions,
  modelRoles,
}: RunComposerRenderProps) {
  const [submissionError, setSubmissionError] = useState<string>();
  return (
    <div className={styles.composerFrame}>
      <div className={styles.composer}>
        {composer.mode !== "continue" && composer.recipients.length > 1 && (
          <RecipientSelect
            mode={composer.mode}
            recipients={composer.recipients}
            value={composer.recipient?.id}
            onChange={composer.selectRecipient}
          />
        )}
        <QuestionCollection questions={questions} />
        {/* // AI: Rename this to warning and erros. Also, we should move our conditional logic above and outside this */}
        <ChatComposer
          warnings={[
            ...(submissionError
              ? [
                  {
                    message: submissionError,
                    severity: "error",
                  } satisfies ChatComposerWarning,
                ]
              : []),
            ...[
              connected &&
              strategy.status === "ready" &&
              !strategy.selected &&
              savedStrategyName !== undefined
                ? `Strategy unavailable: ${savedStrategyName}. Choose another strategy before sending.`
                : undefined,
              connected && !strategy.pending ? strategy.error : undefined,
              stop.error,
            ].filter((warning): warning is string => Boolean(warning)),
          ]}
          controls={
            <fieldset
              className={styles.strategyControls}
              disabled={
                strategy.isLoading || submission.isSubmitting || !connected
              }
            >
              <legend className={styles.srOnly}>Conversation strategy</legend>
              <StrategySelectRender
                connected={connected}
                status={strategy.status}
                strategies={strategy.strategies}
                selected={strategy.selected}
                onSelect={strategy.select}
              />
              <StrategyModels
                strategyPath={strategy.selected?.path}
                binding={{
                  roles: modelRoles,
                  onChange: strategy.changeModels,
                  onReset: strategy.resetModels,
                }}
              />
            </fieldset>
          }
        >
          <ChatInput
            actions={
              <StopControlRender
                active={stop.active}
                canStop={stop.canStop}
                isStopping={stop.isStopping}
                onStop={stop.stop}
              />
            }
            onSubmit={composer.submit}
            onSubmissionErrorChange={setSubmissionError}
            disabled={!composer.canSubmit}
            clearOnSuccess
            autoFocus
            placeholder={COMPOSER_PLACEHOLDERS[composer.mode]}
          />
        </ChatComposer>
        {submission.dialog && (
          <ContextOverflowDialog
            {...submission.dialog}
            onChoose={submission.choose}
            onCancel={submission.cancel}
          />
        )}
        {/* Outside the fieldset, which would otherwise disable the dialog's buttons. */}
        {strategy.pending && (
          <StrategySwitchDialog
            strategyName={strategy.pending.strategy.name}
            busy={strategy.isLoading}
            error={strategy.error}
            onStopAndSwitch={strategy.stopAndSwitch}
            onWait={strategy.wait}
          />
        )}
      </div>
    </div>
  );
}
