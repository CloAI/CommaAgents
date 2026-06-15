import type {
  RunActionArgsMap,
  RunActionHandler,
  RunActionRegistry,
  SystemDataMap,
  SystemDataStore,
} from "./systems.types";

export function createSystemDataStore(): SystemDataStore {
  const data = new Map<keyof SystemDataMap, unknown>();

  return {
    set<Key extends keyof SystemDataMap>(
      key: Key,
      value: SystemDataMap[Key],
    ): void {
      data.set(key, value);
    },

    get<Key extends keyof SystemDataMap>(
      key: Key,
    ): SystemDataMap[Key] | undefined {
      return data.get(key) as SystemDataMap[Key] | undefined;
    },
  };
}

export function createRunActionRegistry(): RunActionRegistry {
  type StoredActionHandler = RunActionHandler<keyof RunActionArgsMap>;

  const actions = new Map<
    keyof RunActionArgsMap,
    Map<string, StoredActionHandler>
  >();

  return {
    register<ActionName extends keyof RunActionArgsMap>(
      actionName: ActionName,
      runId: string,
      handler: RunActionHandler<ActionName>,
    ): void {
      if (!actions.has(actionName)) {
        actions.set(actionName, new Map());
      }
      actions.get(actionName)!.set(runId, handler as StoredActionHandler);
    },

    invoke<ActionName extends keyof RunActionArgsMap>(
      actionName: ActionName,
      runId: string,
      ...args: RunActionArgsMap[ActionName]
    ): boolean {
      const actionMap = actions.get(actionName);
      if (!actionMap) {
        return false;
      }
      const handler = actionMap.get(runId);
      if (!handler) {
        return false;
      }
      return (handler as RunActionHandler<ActionName>)(...args);
    },

    unregisterAll(runId: string): void {
      for (const actionMap of actions.values()) {
        actionMap.delete(runId);
      }
    },
  };
}
