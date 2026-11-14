import { useCallback, useState } from "react";
import { useCommaAgentsDaemon } from "../useCommaAgentsDaemon";
import { useDaemonMutation } from "../useDaemonMutation";
import type { ModelRoles } from "./useModelRoles.types";

/**
 * Follow the daemon's model roles and save changes to them.
 * Every view of the roles updates when any client changes them, so no copy goes stale.
 * @returns {ModelRoles} Configured roles, the roles offered, and a save action.
 * @example const { modelRoles, save } = useModelRoles();
 */
export function useModelRoles(): ModelRoles {
  const watched = useCommaAgentsDaemon(
    { channel: "core.modelRoles.watch" },
    {},
  );
  const { attempt } = useDaemonMutation("core.modelRoles.set");
  const [saveError, setSaveError] = useState<string>();
  const current = watched.data?.data.modelRoles ?? {};
  const save = useCallback(
    async (roles: Readonly<Record<string, string>>) => {
      setSaveError(undefined);
      const result = await attempt({ modelRoles: { ...current, ...roles } });
      if (!result.ok) {
        setSaveError(result.error.message);
      }
      return result.ok;
    },
    [attempt, current],
  );
  return {
    modelRoles: current,
    defaults: watched.data?.data.defaults ?? [],
    // Loading until the first snapshot, not just the subscription acknowledgement.
    isLoading:
      watched.data === undefined && !watched.errors && !watched.clientError,
    error: saveError ?? watched.errors?.message ?? watched.clientError?.message,
    save,
  };
}
