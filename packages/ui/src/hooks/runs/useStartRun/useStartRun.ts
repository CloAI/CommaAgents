import { RunErrorCode } from "@comma-agents/daemon/protocol";
import { useCallback, useContext, useRef, useState } from "react";
import { ChatPaneContext } from "../../useChatPane";
import { useDaemonMutation } from "../../useDaemonMutation";
import { useOptionalWorkspaces } from "../../useWorkspaces";
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
  const workspaces = useOptionalWorkspaces();
  const pane = useContext(ChatPaneContext);
  const { attempt: prepare } = useDaemonMutation("runs.prepare");
  const { attempt: begin } = useDaemonMutation("runs.start");
  const start = useCallback(
    async (strategy: StrategyItem | undefined, prompt: string) => {
      if (starting.current) {
        return undefined;
      }
      if (workspaces && !workspaces.project) {
        setError("Wait for the workspace to finish loading.");
        return undefined;
      }
      if (!strategy) {
        setError("Choose a strategy first.");
        return undefined;
      }
      if (pane?.interactionBlocked || workspaces?.pending) {
        return undefined;
      }
      starting.current = true;
      workspaces?.beginSubmission();
      setStarting(true);
      setError(undefined);
      setMissingRoles(undefined);
      try {
        const roles = settings.strategyModelRoles?.[strategy.path];
        const prepared = await prepare({
          configuration: {
            strategyPath: strategy.path,
            cwd: workspaces?.project?.cwd,
            manifestPath: strategy.manifestPath,
            modelRoles: roles && Object.keys(roles).length ? roles : undefined,
          },
        });
        if (
          prepared.ok &&
          workspaces &&
          !(await workspaces.registerChat(
            prepared.data.runId,
            prompt.slice(0, 100),
          ))
        ) {
          setError(
            "Could not assign the prepared chat to this workspace. Try again.",
          );
          return undefined;
        }
        const started = prepared.ok
          ? await begin({ runId: prepared.data.runId, input: prompt })
          : prepared;
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
      } finally {
        starting.current = false;
        setStarting(false);
        workspaces?.endSubmission();
      }
    },
    [settings.strategyModelRoles, prepare, begin, workspaces, pane],
  );
  const dismissMissingRoles = useCallback(() => setMissingRoles(undefined), []);
  return { start, isStarting, error, missingRoles, dismissMissingRoles };
}
