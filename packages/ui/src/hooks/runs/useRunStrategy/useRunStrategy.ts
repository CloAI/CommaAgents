import { RunErrorCode } from "@comma-agents/daemon/protocol";
import { useCallback, useMemo, useRef, useState } from "react";
import { useDaemonMutation } from "../../useDaemonMutation";
import { useStrategies } from "../../useStrategies";
import type { RunSnapshot } from "../useRunChannel";
import { useRunControls } from "../RunProvider/RunProvider.context";
import type {
  PendingStrategyChange,
  RunStrategy,
} from "./useRunStrategy.types";

/**
 * Own the run's saved strategy and model changes, including the busy-run decision.
 * Mounted once by {@link RunProvider}; read it with {@link useRunStrategy}.
 * @param {string} runId - Conversation to update.
 * @param {RunSnapshot | undefined} snapshot - Latest authoritative run selection.
 * @returns {RunStrategy} Strategy controls and active-work decision actions.
 */
export function useRunStrategyState(
  runId: string,
  snapshot: RunSnapshot | undefined,
): RunStrategy {
  const [error, setError] = useState<string>();
  const [pending, setPending] = useState<PendingStrategyChange>();
  const saving = useRef(false);
  const { status, strategies } = useStrategies();
  const { attempt, isLoading } = useDaemonMutation("runs.switchStrategy");
  const selected = strategies.find(
    (strategy) => strategy.path === snapshot?.configuration.strategyPath,
  );
  const apply = useCallback(
    async (change: PendingStrategyChange, stop: boolean) => {
      if (!snapshot || saving.current) {
        return;
      }
      saving.current = true;
      setError(undefined);
      const { strategy, modelRoles } = change;
      const result = await attempt({
        runId,
        strategyPath: strategy.path,
        manifestPath: strategy.manifestPath ?? null,
        modelRoles,
        stop,
        expectedRevision: snapshot.strategyState?.revision ?? 0,
      });
      saving.current = false;
      if (result.ok) {
        return setPending(undefined);
      }
      setError(result.error.message);
      // Another pane may have started execution since this pane last received a snapshot.
      if (result.error.code === RunErrorCode.RUN_BUSY) {
        setPending(change);
      }
    },
    [attempt, runId, snapshot],
  );
  const request = useCallback(
    (change: PendingStrategyChange) => {
      if (saving.current) {
        return;
      }
      if (snapshot?.phase === "running" || snapshot?.phase === "preparing") {
        setPending(change);
      } else {
        void apply(change, false);
      }
    },
    [apply, snapshot],
  );
  const select = useCallback(
    (path: string) => {
      const strategy = strategies.find((entry) => entry.path === path);
      if (strategy && path !== snapshot?.configuration.strategyPath) {
        request({ strategy });
      }
    },
    [strategies, snapshot, request],
  );
  const changeModels = useCallback(
    (models: Readonly<Record<string, string>>) => {
      if (selected) {
        request({ strategy: selected, modelRoles: models });
      }
    },
    [selected, request],
  );
  const resetModels = useCallback(() => {
    if (selected) {
      request({ strategy: selected, modelRoles: null });
    }
  }, [selected, request]);
  const wait = useCallback(() => {
    setPending(undefined);
    setError(undefined);
  }, []);
  const stopAndSwitch = useCallback(() => {
    if (pending) {
      void apply(pending, true);
    }
  }, [apply, pending]);
  return useMemo(
    () => ({
      status,
      strategies,
      selected,
      select,
      changeModels,
      resetModels,
      pending,
      wait,
      stopAndSwitch,
      error,
      isLoading,
    }),
    [
      status,
      strategies,
      selected,
      select,
      changeModels,
      resetModels,
      pending,
      wait,
      stopAndSwitch,
      error,
      isLoading,
    ],
  );
}

/**
 * Read the followed run's strategy controls from the enclosing {@link RunProvider}.
 * @returns {RunStrategy} Strategy controls and active-work decision actions.
 */
export function useRunStrategy(): RunStrategy {
  return useRunControls().strategy;
}
