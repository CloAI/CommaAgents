import { useCallback, useContext, useMemo } from "react";

import { useDaemonContext } from "../useDaemon/useDaemon";
import { ChatSessionsContext } from "./useChat.context";
import type { ChatSessionId, ChatSessionsContextType, UseChatState } from "./useChat.types";

/** Empty-messages singleton used when no session is bound (stable reference). */
const EMPTY_MESSAGES = Object.freeze([]) as UseChatState["messages"];

/**
 * Internal consumer — resolves the `ChatSessionsContext` or throws.
 *
 * Used by both `useChat` and `useChatSessions`. Must be called inside a
 * `<ChatSessionsContextProvider>`.
 */
function useChatSessionsContext(): ChatSessionsContextType {
  const contextValue = useContext(ChatSessionsContext);
  if (!contextValue) {
    throw new Error(
      "useChat / useChatSessions must be used within a <ChatSessionsContextProvider>",
    );
  }
  return contextValue;
}

/**
 * Bind a view to a single chat session.
 *
 * If `sessionId` is provided, the hook observes that session. Otherwise it
 * observes the currently-active session. When no matching session exists
 * (e.g. on first mount before any strategy has been started), the returned
 * view exposes empty values; `startStrategy` is still functional and will
 * create a new session.
 *
 * Must be called inside both a `<DaemonProvider>` and a
 * `<ChatSessionsContextProvider>`.
 */
export function useChat(sessionId?: ChatSessionId): UseChatState {
  const context = useChatSessionsContext();
  const { status: connectionStatus } = useDaemonContext();

  const resolvedSessionId: ChatSessionId | null =
    sessionId ?? context.activeSessionId;
  const session = resolvedSessionId ? context.sessions.get(resolvedSessionId) ?? null : null;

  const startStrategy = context.startStrategy;

  const sendInput = useCallback(
    (text: string): void => {
      if (!resolvedSessionId) return;
      context.sendInput(resolvedSessionId, text);
    },
    [context, resolvedSessionId],
  );

  const sendPermissionDecision = useCallback(
    (decision: "allow" | "deny" | "allow-session" | "deny-session"): void => {
      if (!resolvedSessionId) return;
      context.sendPermissionDecision(resolvedSessionId, decision);
    },
    [context, resolvedSessionId],
  );

  const reset = useCallback((): void => {
    if (!resolvedSessionId) return;
    context.resetSession(resolvedSessionId);
  }, [context, resolvedSessionId]);

  const stop = useCallback((): void => {
    if (!resolvedSessionId) return;
    context.stopSession(resolvedSessionId);
  }, [context, resolvedSessionId]);

  return useMemo<UseChatState>(
    () => ({
      sessionId: resolvedSessionId,
      messages: session?.messages ?? EMPTY_MESSAGES,
      status: session?.status ?? "idle",
      error: session?.error ?? null,
      pendingInputAgent: session?.pendingInputAgent ?? null,
      strategyName: session?.strategyName ?? null,
      strategyPath: session?.strategyPath ?? null,
      readOnly: session?.readOnly ?? false,
      pendingPermissionRequest: session?.pendingPermissionRequests[0] ?? null,
      runId: session?.daemonRunId ?? null,
      connectionStatus,
      startStrategy,
      sendInput,
      sendPermissionDecision,
      reset,
      stop,
    }),
    [
      resolvedSessionId,
      session,
      connectionStatus,
      startStrategy,
      sendInput,
      sendPermissionDecision,
      reset,
      stop,
    ],
  );
}

// Re-export for legacy imports.
export { useChatSessionsContext };
