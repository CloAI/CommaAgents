import { ChatInput } from "../../../components/ChatInput";
import { ContextOverflowDialog } from "../../../components/ContextOverflowDialog";
import { QuestionPrompt } from "../../../components/QuestionPrompt";
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
import { useDaemonConnectionStatus } from "../../../hooks/useCommaAgentsDaemon";
import { usePendingQuestions } from "../../../hooks/usePendingQuestions";
import { COMPOSER_PLACEHOLDERS } from "../RunPage.constants";
import { StopControl } from "../StopControl";
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
    <div className={styles.composerFrame}>
      <div className={styles.composer}>
        {strategy.status === "ready" && !strategy.selected && snapshot && (
          <p role="alert">
            Strategy unavailable:{" "}
            {snapshot.strategy?.name ?? snapshot.configuration.strategyPath}.
            Choose another strategy before sending.
          </p>
        )}
        {strategy.error && !strategy.pending && (
          <p role="alert">{strategy.error}</p>
        )}
        {composer.mode !== "continue" && composer.recipients.length > 1 && (
          <RecipientSelect
            mode={composer.mode}
            recipients={composer.recipients}
            value={composer.recipient?.id}
            onChange={composer.selectRecipient}
          />
        )}
        {stop.error && <p role="alert">{stop.error}</p>}
        {questions.map((question) => (
          <QuestionPrompt key={question.requestId} question={question} />
        ))}
        <ChatInput
          actions={<StopControl />}
          onSubmit={composer.submit}
          disabled={!composer.canSubmit}
          clearOnSuccess
          autoFocus
          placeholder={COMPOSER_PLACEHOLDERS[composer.mode]}
        />
        {submission.dialog && (
          <ContextOverflowDialog
            {...submission.dialog}
            onChoose={submission.choose}
            onCancel={submission.cancel}
          />
        )}
        <fieldset
          className={styles.strategyControls}
          disabled={strategy.isLoading || submission.isSubmitting || !connected}
        >
          <legend className={styles.srOnly}>Conversation strategy</legend>
          <StrategySelectRender
            status={strategy.status}
            strategies={strategy.strategies}
            selected={strategy.selected}
            onSelect={strategy.select}
          />
          <StrategyModels
            strategyPath={strategy.selected?.path}
            binding={{
              overrides: snapshot?.configuration.modelOverrides ?? {},
              modelOverride: snapshot?.configuration.modelOverride,
              onChange: strategy.changeModels,
            }}
          />
        </fieldset>
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
