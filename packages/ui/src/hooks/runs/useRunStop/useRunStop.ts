import { useCallback, useMemo, useRef, useState } from "react";
import { useDaemonConnectionStatus } from "../../useCommaAgentsDaemon";
import { useDaemonMutation } from "../../useDaemonMutation";
import { useRunControls } from "../RunProvider/RunProvider.context";
import type { RunStop, RunStopOptions } from "./useRunStop.types";

/**
 * Own stopping the run, once at a time.
 * Mounted once by {@link RunProvider}; read it with {@link useRunStop}.
 * @param {string} runId - Run to stop.
 * @param {RunStopOptions} options - Whether stopping applies and what to do first.
 * @returns {RunStop} Stop action and request state.
 */
export function useRunStopState(
  runId: string,
  { active, blocked, onStop }: RunStopOptions,
): RunStop {
  const [error, setError] = useState<string>();
  const pending = useRef(false);
  const connected = useDaemonConnectionStatus() === "connected";
  const { attempt, isLoading } = useDaemonMutation("runs.stop");
  const canStop = active && connected && !blocked;
  const stop = useCallback(() => {
    if (!canStop || pending.current) {
      return;
    }
    pending.current = true;
    setError(undefined);
    onStop();
    void attempt({ runId }).then((result) => {
      pending.current = false;
      if (!result.ok) {
        setError(result.error.message);
      }
    });
  }, [canStop, onStop, attempt, runId]);
  return useMemo(
    () => ({ active, canStop, stop, isStopping: isLoading, error }),
    [active, canStop, stop, isLoading, error],
  );
}

/**
 * Read stopping the followed run from the enclosing {@link RunProvider}.
 * @returns {RunStop} Stop action and request state.
 */
export function useRunStop(): RunStop {
  return useRunControls().stop;
}
