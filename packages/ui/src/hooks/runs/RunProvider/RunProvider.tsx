import { useMemo } from "react";
import type { ReactNode } from "react";
import { useRunChannel } from "../useRunChannel";
import { useRunStopState } from "../useRunStop/useRunStop";
import { hasActiveWork } from "../useRunStop/useRunStop.utils";
import { useRunStrategyState } from "../useRunStrategy/useRunStrategy";
import { useRunSubmissionState } from "../useRunSubmission/useRunSubmission";
import { RunControlsContext, RunFeedContext } from "./RunProvider.context";

/** The run to follow and the content that uses it. */
export interface RunProviderProps {
  /** Run to follow. */
  readonly runId: string;
  readonly children: ReactNode;
}

/**
 * Follow one run and share its feed and controls, so each consumer reads only the slices it needs.
 * @param {RunProviderProps} props - Component properties.
 * @returns {React.ReactElement} The children within the run's contexts.
 */
export function RunProvider({ runId, children }: RunProviderProps) {
  const feed = useRunChannel(runId);
  const submission = useRunSubmissionState(
    runId,
    feed.snapshot?.strategyState?.revision ?? 0,
  );
  const strategy = useRunStrategyState(runId, feed.snapshot);
  const stop = useRunStopState(runId, {
    active: hasActiveWork(feed),
    blocked:
      strategy.isLoading ||
      strategy.pending !== undefined ||
      submission.dialog !== undefined,
    onStop: submission.cancel,
  });
  const controls = useMemo(
    () => ({ runId, submission, strategy, stop }),
    [runId, submission, strategy, stop],
  );
  return (
    <RunFeedContext.Provider value={feed}>
      <RunControlsContext.Provider value={controls}>
        {children}
      </RunControlsContext.Provider>
    </RunFeedContext.Provider>
  );
}
