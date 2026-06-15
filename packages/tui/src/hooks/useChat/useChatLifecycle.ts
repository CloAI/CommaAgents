import { useCallback } from "react";
import type { ChatRunId } from "./useChat.types";
import { useChatRunLifecycle } from "./useChatRunLifecycle";

export interface UseChatLifecycleResult {
  readonly startStrategy: (
    strategyPath: string,
    input?: string,
    cwd?: string,
    manifestPath?: string,
  ) => ChatRunId;
}

export function useChatLifecycle(): UseChatLifecycleResult {
  const { startStrategy: startRunStrategy } = useChatRunLifecycle();

  const startStrategy = useCallback(
    (
      strategyPath: string,
      input?: string,
      cwd?: string,
      manifestPath?: string,
    ): ChatRunId => {
      return startRunStrategy(strategyPath, input, cwd, manifestPath);
    },
    [startRunStrategy],
  );

  return {
    startStrategy,
  };
}
