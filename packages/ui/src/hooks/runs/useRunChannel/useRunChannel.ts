import { RunErrorCode } from "@comma-agents/daemon/protocol";
import { useMemo, useReducer, useState } from "react";
import { useDaemonChannel } from "../../useDaemonChannel";
import type { DaemonFailure } from "../../useDaemonMutation";
import { INITIAL_RUN_FEED } from "./useRunChannel.constants";
import { reduceRunFeed } from "./useRunChannel.reducer";
import { selectRunStatus } from "./useRunChannel.selectors";
import type { RunFeed } from "./useRunChannel.types";

/**
 * Subscribe to a run's channel and accumulate what it says.
 * Use it directly for read-only views; a {@link RunProvider} shares one with its consumers.
 * @param {string} runId - Run to follow.
 * @returns {RunFeed} Messages, status, current input recipients, and why the run cannot be followed, if so.
 * @example
 * const { messages, status } = useRunChannel(child.childRunId);
 */
export function useRunChannel(runId: string): RunFeed {
  const [state, dispatch] = useReducer(reduceRunFeed, INITIAL_RUN_FEED);
  const [subscription, setSubscription] = useState<DaemonFailure>();
  useDaemonChannel("runs", { runId }, dispatch, setSubscription);
  return useMemo(
    () => ({
      ...state,
      ...selectRunStatus(state),
      unavailable:
        subscription &&
        (subscription.code === RunErrorCode.RUN_NOT_FOUND
          ? "Run not found."
          : subscription.message),
    }),
    [state, subscription],
  );
}
