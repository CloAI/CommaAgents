import type { DiscoveredStrategy } from "@comma-agents/core";
import { useCallback, useContext } from "react";

import { ChatRunsContext } from "./useChat.context";
import type { ChatRunId, ChatRunsContextType } from "./useChat.types";

function useChatRunsContext(): ChatRunsContextType {
  const contextValue = useContext(ChatRunsContext);
  if (!contextValue) {
    throw new Error(
      "useChatActions must be used within a <ChatRunsContextProvider>",
    );
  }
  return contextValue;
}

export interface UseChatActionsResult {
  readonly sendInput: (text: string) => void;
  readonly sendSteer: (text: string) => void;
  readonly sendContinue: (strategy: DiscoveredStrategy, text: string) => void;
  readonly sendPermissionDecision: (
    decision: "allow" | "deny" | "allow-session" | "deny-session",
  ) => void;
  readonly sendQuestionResponse: (response: string) => void;
  readonly reset: () => void;
  readonly stop: () => void;
}

export function useChatActions(chatRunId?: ChatRunId): UseChatActionsResult {
  const context = useChatRunsContext();

  const resolvedChatRunId: ChatRunId | null =
    chatRunId ?? context.activeChatRunId;

  const sendInput = useCallback(
    (text: string): void => {
      if (!resolvedChatRunId) return;
      context.sendInput(resolvedChatRunId, text);
    },
    [context, resolvedChatRunId],
  );

  const sendSteer = useCallback(
    (text: string): void => {
      if (!resolvedChatRunId) return;
      context.sendSteer(resolvedChatRunId, text);
    },
    [context, resolvedChatRunId],
  );

  const sendContinue = useCallback(
    (strategy: DiscoveredStrategy, text: string): void => {
      if (!resolvedChatRunId) return;
      context.continueRun(resolvedChatRunId, strategy, text);
    },
    [context, resolvedChatRunId],
  );

  const sendPermissionDecision = useCallback(
    (decision: "allow" | "deny" | "allow-session" | "deny-session"): void => {
      if (!resolvedChatRunId) return;
      context.sendPermissionDecision(resolvedChatRunId, decision);
    },
    [context, resolvedChatRunId],
  );

  const sendQuestionResponse = useCallback(
    (response: string): void => {
      if (!resolvedChatRunId) return;
      context.sendQuestionResponse(resolvedChatRunId, response);
    },
    [context, resolvedChatRunId],
  );

  const reset = useCallback((): void => {
    if (!resolvedChatRunId) return;
    context.resetChatRun(resolvedChatRunId);
  }, [context, resolvedChatRunId]);

  const stop = useCallback((): void => {
    if (!resolvedChatRunId) return;
    context.stopChatRun(resolvedChatRunId);
  }, [context, resolvedChatRunId]);

  return {
    sendInput,
    sendSteer,
    sendContinue,
    sendPermissionDecision,
    sendQuestionResponse,
    reset,
    stop,
  };
}
