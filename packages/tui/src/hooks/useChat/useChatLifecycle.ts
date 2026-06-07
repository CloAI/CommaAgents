import { useCallback, useContext } from "react";

import { ChatRunsContext } from "./useChat.context";
import type { ChatRunId, ChatRunsContextType } from "./useChat.types";

function useChatRunsContext(): ChatRunsContextType {
  const contextValue = useContext(ChatRunsContext);
  if (!contextValue) {
    throw new Error(
      "useChatLifecycle must be used within a <ChatRunsContextProvider>",
    );
  }
  return contextValue;
}

export interface UseChatLifecycleResult {
  readonly startStrategy: (
    strategyPath: string,
    input?: string,
    cwd?: string,
    manifestPath?: string,
    previousRunId?: string,
  ) => ChatRunId;
}

export function useChatLifecycle(
  chatRunId?: ChatRunId,
): UseChatLifecycleResult {
  const context = useChatRunsContext();

  const startStrategy = useCallback(
    (
      strategyPath: string,
      input?: string,
      cwd?: string,
      manifestPath?: string,
      previousRunId?: string,
    ): ChatRunId => {
      return context.startStrategy(strategyPath, input, cwd, manifestPath, previousRunId);
    },
    [context],
  );

  return {
    startStrategy,
  };
}
