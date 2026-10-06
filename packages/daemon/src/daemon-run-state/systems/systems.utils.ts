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

  const actions = new Map<keyof RunActionArgsMap, StoredActionHandler>();

  return {
    register<ActionName extends keyof RunActionArgsMap>(
      actionName: ActionName,
      handler: RunActionHandler<ActionName>,
    ): void {
      actions.set(actionName, handler as StoredActionHandler);
    },

    invoke<ActionName extends keyof RunActionArgsMap>(
      actionName: ActionName,
      ...args: RunActionArgsMap[ActionName]
    ): boolean {
      const handler = actions.get(actionName);
      if (!handler) {
        return false;
      }
      return (handler as RunActionHandler<ActionName>)(...args);
    },

    unregisterAll(): void {
      actions.clear();
    },
  };
}
