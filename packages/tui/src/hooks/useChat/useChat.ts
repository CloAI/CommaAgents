import { useCallback, useContext, useMemo } from "react";

import { useDaemon } from "../useDaemon/useDaemon";
import { ChatRunsContext } from "./useChat.context";
import type {
  ChatRunId,
  ChatRunsContextType,
  UseChatState,
} from "./useChat.types";

/** Empty-messages singleton used when no run is bound (stable reference). */
const EMPTY_MESSAGES = Object.freeze([]) as UseChatState["messages"];

/**
 * Internal consumer — resolves the `ChatRunsContext` or throws.
 *
 * Used by both `useChat` and `useChatRuns`. Must be called inside a
 * `<ChatRunsContextProvider>`.
 */
function useChatRunsContext(): ChatRunsContextType {
  const contextValue = useContext(ChatRunsContext);
  if (!contextValue) {
    throw new Error(
      "useChat / useChatRuns must be used within a <ChatRunsContextProvider>",
    );
  }
  return contextValue;
}

/**
 * Bind a view to a single chat run.
 *
 * If `chatRunId` is provided, the hook observes that run. Otherwise it
 * observes the currently-active run. When no matching run exists
 * (e.g. on first mount before any strategy has been started), the returned
 * view exposes empty values; `startStrategy` is still functional and will
 * create a new run.
 *
 * Must be called inside both a `<DaemonContextProvider>` and a
 * `<ChatRunsContextProvider>`.
 */
export function useChat(chatRunId?: ChatRunId): UseChatState {
  const context = useChatRunsContext();
  const { status: connectionStatus } = useDaemon();

  const resolvedChatRunId: ChatRunId | null =
    chatRunId ?? context.activeChatRunId;
  const chatRun = resolvedChatRunId
    ? (context.chatRuns.get(resolvedChatRunId) ?? null)
    : null;

  const startStrategy = context.startStrategy;
  const resumeRun = context.resumeRun;

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

  const continueRun = useCallback(
    (input: string, strategyPath?: string): void => {
      if (!resolvedChatRunId) return;
      context.continueChatRun(resolvedChatRunId, input, strategyPath);
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

  return useMemo<UseChatState>(
    () => ({
      chatRunId: resolvedChatRunId,
      messages: chatRun?.messages ?? EMPTY_MESSAGES,
      status: chatRun?.status ?? "idle",
      error: chatRun?.error ?? null,
      pendingInputAgent: chatRun?.pendingInputAgent ?? null,
      strategyName: chatRun?.strategyName ?? null,
      strategyPath: chatRun?.strategyPath ?? null,
      readOnly: chatRun?.readOnly ?? false,
      pendingPermissionRequest: chatRun?.pendingPermissionRequests[0] ?? null,
      pendingQuestionRequest: chatRun?.pendingQuestionRequests[0] ?? null,
      runId: chatRun?.daemonRunId ?? null,
      connectionStatus,
      startStrategy,
      resumeRun,
      sendInput,
      sendSteer,
      continueRun,
      sendPermissionDecision,
      sendQuestionResponse,
      reset,
      stop,
    }),
    [
      resolvedChatRunId,
      chatRun,
      connectionStatus,
      startStrategy,
      resumeRun,
      sendInput,
      sendSteer,
      continueRun,
      sendPermissionDecision,
      sendQuestionResponse,
      reset,
      stop,
    ],
  );
}

// Re-export for legacy imports.
export { useChatRunsContext };
