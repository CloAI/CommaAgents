import { useContext, useMemo } from "react";

import { useDaemon } from "../useDaemon/useDaemon";
import { ChatRunsContext } from "./useChat.context";
import type {
  ChatMessage,
  ChatRunId,
  ChatRunsContextType,
  ChatStatus,
  PendingPermissionRequest,
  PendingQuestionRequest,
} from "./useChat.types";
import type { WebSocketStatus } from "../useWebSocket/useWebSocket.types";

const EMPTY_MESSAGES = Object.freeze([]) as readonly ChatMessage[];

function useChatRunsContext(): ChatRunsContextType {
  const contextValue = useContext(ChatRunsContext);
  if (!contextValue) {
    throw new Error(
      "useChatState must be used within a <ChatRunsContextProvider>",
    );
  }
  return contextValue;
}

export interface UseChatStateResult {
  readonly chatRunId: ChatRunId | null;
  readonly messages: readonly ChatMessage[];
  readonly status: ChatStatus;
  readonly error: string | null;
  readonly pendingInputAgent: string | null;
  readonly strategyName: string | null;
  readonly strategyPath: string | null;
  readonly pendingPermissionRequest: PendingPermissionRequest | null;
  readonly pendingQuestionRequest: PendingQuestionRequest | null;
  readonly runId: string | null;
  readonly connectionStatus: WebSocketStatus;
}

export function useChatState(chatRunId?: ChatRunId): UseChatStateResult {
  const context = useChatRunsContext();
  const { status: connectionStatus } = useDaemon();

  return useMemo(() => {
    const resolvedChatRunId: ChatRunId | null =
      chatRunId ?? context.activeChatRunId;
    const chatRun = resolvedChatRunId
      ? (context.chatRuns.get(resolvedChatRunId) ?? null)
      : null;

    return {
      chatRunId: resolvedChatRunId,
      messages: chatRun?.messages ?? EMPTY_MESSAGES,
      status: chatRun?.status ?? "idle",
      error: chatRun?.error ?? null,
      pendingInputAgent: chatRun?.pendingInputAgent ?? null,
      strategyName: chatRun?.strategyName ?? null,
      strategyPath: chatRun?.strategyPath ?? null,
      pendingPermissionRequest: chatRun?.pendingPermissionRequests[0] ?? null,
      pendingQuestionRequest: chatRun?.pendingQuestionRequests[0] ?? null,
      runId: chatRun?.daemonRunId ?? null,
      connectionStatus,
    };
  }, [chatRunId, context.activeChatRunId, context.chatRuns, connectionStatus]);
}
