import { RunErrorCode } from "@comma-agents/daemon/protocol";
import { useCallback, useRef, useState } from "react";
import { useDaemonMutation } from "../../useDaemonMutation";
import { useSettings } from "../../useSettings";
import type { StrategyItem } from "../../useStrategies";
import type { StartRun } from "./useStartRun.types";
import { missingRolesFrom } from "./useStartRun.utils";

/**
 * Prepare a run and start it with a prompt, reporting model roles the daemon lacks.
 * @returns {StartRun} Start action, its progress, and any roles to configure before retrying.
 */
export function useStartRun(): StartRun {
  const [isStarting, setStarting] = useState(false);
  const [error, setError] = useState<string>();
  const [missingRoles, setMissingRoles] = useState<readonly string[]>();
  const starting = useRef(false);
  const { settings } = useSettings();
  const { attempt: prepare } = useDaemonMutation("runs.prepare");
  const { attempt: begin } = useDaemonMutation("runs.start");
  const start = useCallback(
    async (strategy: StrategyItem | undefined, prompt: string) => {
      if (starting.current) {
        return undefined;
      }
      if (!strategy) {
        setError("Choose a strategy first.");
        return undefined;
      }
      starting.current = true;
      setStarting(true);
      setError(undefined);
      setMissingRoles(undefined);
      const roles = settings.strategyModelRoles?.[strategy.path];
      const prepared = await prepare({
        configuration: {
          strategyPath: strategy.path,
          manifestPath: strategy.manifestPath,
          modelRoles: roles && Object.keys(roles).length ? roles : undefined,
        },
      });
      const started = prepared.ok
        ? await begin({ runId: prepared.data.runId, input: prompt })
        : prepared;
      starting.current = false;
      setStarting(false);
      if (started.ok && prepared.ok) {
        return prepared.data.runId;
      }
      if (!started.ok) {
        const roles =
          started.error.code === RunErrorCode.MISSING_MODEL_ROLES
            ? missingRolesFrom(started.error)
            : undefined;
        setMissingRoles(roles);
        setError(roles ? undefined : started.error.message);
      }
      return undefined;
    },
    [settings.strategyModelRoles, prepare, begin],
  );
  const dismissMissingRoles = useCallback(() => setMissingRoles(undefined), []);
  return { start, isStarting, error, missingRoles, dismissMissingRoles };
}
