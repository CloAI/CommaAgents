import type {
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
  const actions = new Map<
    string,
    Map<string, (...args: unknown[]) => boolean>
  >();

  return {
    register(
      actionName: string,
      runId: string,
      handler: (...args: unknown[]) => boolean,
    ): void {
      if (!actions.has(actionName)) {
        actions.set(actionName, new Map());
      }
      actions.get(actionName)!.set(runId, handler);
    },

    invoke(actionName: string, runId: string, ...args: unknown[]): boolean {
      const actionMap = actions.get(actionName);
      if (!actionMap) {
        return false;
      }
      const handler = actionMap.get(runId);
      if (!handler) {
        return false;
      }
      return handler(...args);
    },

    unregisterAll(runId: string): void {
      for (const actionMap of actions.values()) {
        actionMap.delete(runId);
      }
    },
  };
}
