import { ContextOverflowDialog } from "../../../components/ContextOverflowDialog";
import { StrategySwitchDialog } from "../../../components/StrategySwitchDialog";
import { useRunStrategy, useRunSubmission } from "../../../hooks/runs";

/**
 * Ask for the decisions a run change needs: stopping to switch strategy, or how much context to send.
 * @returns {React.ReactElement} The open decision dialogs, if any.
 */
export function RunDialogs() {
  const strategy = useRunStrategy();
  const submission = useRunSubmission();
  return (
    <>
      {strategy.pending && (
        <StrategySwitchDialog
          strategyName={strategy.pending.strategy.name}
          busy={strategy.isLoading}
          error={strategy.error}
          onStopAndSwitch={strategy.stopAndSwitch}
          onWait={strategy.wait}
        />
      )}
      {submission.dialog && (
        <ContextOverflowDialog
          {...submission.dialog}
          onChoose={submission.choose}
          onCancel={submission.cancel}
        />
      )}
    </>
  );
}
