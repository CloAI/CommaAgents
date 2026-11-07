import { ChatComposer } from "../../../components/ChatComposer";
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
        {composer.mode !== "continue" && composer.recipients.length > 1 && (
          <RecipientSelect
            mode={composer.mode}
            recipients={composer.recipients}
            value={composer.recipient?.id}
            onChange={composer.selectRecipient}
          />
        )}
        {questions.map((question) => (
          <QuestionPrompt key={question.requestId} question={question} />
        ))}
        <ChatComposer
          warnings={[
            connected &&
            strategy.status === "ready" &&
            !strategy.selected &&
            snapshot
              ? `Strategy unavailable: ${snapshot.strategy?.name ?? snapshot.configuration.strategyPath}. Choose another strategy before sending.`
              : undefined,
            connected && !strategy.pending ? strategy.error : undefined,
            stop.error,
          ].filter((warning): warning is string => Boolean(warning))}
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
                  roles: snapshot?.configuration.modelRoles ?? {},
                  onChange: strategy.changeModels,
                  onReset: strategy.resetModels,
                }}
              />
            </fieldset>
          }
        >
          <ChatInput
            actions={<StopControl />}
            onSubmit={composer.submit}
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
