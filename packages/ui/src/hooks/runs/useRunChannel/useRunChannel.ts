import { useMemo, useReducer } from "react";
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
 * @param {(error: DaemonFailure) => void} [onError] - Called when the run cannot be followed, such as when it does not exist.
 * @returns {RunFeed} Messages, status, and current input recipients.
 * @example
 * const { messages, status } = useRunChannel(child.childRunId);
 */
export function useRunChannel(
  runId: string,
  onError?: (error: DaemonFailure) => void,
): RunFeed {
  const [state, dispatch] = useReducer(reduceRunFeed, INITIAL_RUN_FEED);
  useDaemonChannel("runs", { runId }, dispatch, onError);
  return useMemo(() => ({ ...state, ...selectRunStatus(state) }), [state]);
}
