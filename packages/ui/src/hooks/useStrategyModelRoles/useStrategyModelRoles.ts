import { useCallback, useMemo } from "react";
import type { StrategyModelBinding } from "../../components/StrategyModels";
import { useSettings } from "../useSettings";

/**
 * Remember the model roles chosen for a strategy before any chat exists, to send when it starts.
 * @param {string | undefined} strategyPath - Strategy the choices belong to.
 * @returns {StrategyModelBinding} The saved roles and actions to change or clear them.
 * @example const binding = useStrategyModelRoles(selected?.path);
 */
export function useStrategyModelRoles(
  strategyPath: string | undefined,
): StrategyModelBinding {
  const { settings, saveSettings } = useSettings();
  const roles = useMemo(
    () =>
      strategyPath === undefined
        ? {}
        : (settings.strategyModelRoles?.[strategyPath] ?? {}),
    [settings.strategyModelRoles, strategyPath],
  );
  const store = useCallback(
    (next: Readonly<Record<string, string>>) => {
      if (strategyPath !== undefined) {
        saveSettings({
          ...settings,
          strategyModelRoles: {
            ...settings.strategyModelRoles,
            [strategyPath]: next,
          },
        });
      }
    },
    [settings, saveSettings, strategyPath],
  );
  const onChange = useCallback(
    (changes: Readonly<Record<string, string>>) => store(changes),
    [store],
  );
  const onReset = useCallback(() => store({}), [store]);
  return useMemo(
    () => ({ roles, onChange, onReset }),
    [roles, onChange, onReset],
  );
}
