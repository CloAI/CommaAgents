import type {
  RequestPermissionMessage,
  RequestQuestionMessage,
} from "@comma-agents/daemon";
import { useMemo } from "react";

import { useDaemon } from "../useDaemon/useDaemon";
import type { WebSocketStatus } from "../useWebSocket/useWebSocket.types";
import type { ChatMessage, ChatRunId, ChatStatus } from "./useChat.types";
import { useChatRuns } from "./useChatRuns";

const EMPTY_MESSAGES = Object.freeze([]) as readonly ChatMessage[];

export interface UseChatStateResult {
  readonly chatRunId: ChatRunId | null;
  readonly messages: readonly ChatMessage[];
  readonly status: ChatStatus;
  readonly error: string | null;
  readonly pendingInputAgent: string | null;
  readonly strategyName: string | null;
  readonly strategyPath: string | null;
  readonly pendingPermissionRequest: RequestPermissionMessage | null;
  readonly pendingQuestionRequest: RequestQuestionMessage | null;
  readonly runId: string | null;
  readonly connectionStatus: WebSocketStatus;
}

export function useChatState(chatRunId: ChatRunId | null): UseChatStateResult {
  const context = useChatRuns();
  const { status: connectionStatus } = useDaemon();

  return useMemo(() => {
    const chatRun = chatRunId
      ? (context.chatRuns.get(chatRunId) ?? null)
      : null;

    return {
      chatRunId,
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
  }, [chatRunId, context.chatRuns, connectionStatus]);
}
