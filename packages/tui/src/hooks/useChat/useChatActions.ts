import { useCallback } from "react";

import type { ChatRunId } from "./useChat.types";
import { useChatInputRequests } from "./useChatInputRequests";
import { useChatPermissionRequests } from "./useChatPermissionRequests";
import { useChatQuestionRequests } from "./useChatQuestionRequests";
import { useChatRunLifecycle } from "./useChatRunLifecycle";
import { useChatSteering } from "./useChatSteering";

export interface UseChatActionsResult {
  readonly sendInput: (text: string) => void;
  readonly sendSteer: (text: string) => void;
  readonly sendPermissionDecision: (
    decision: "allow" | "deny" | "allow-session" | "deny-session",
  ) => void;
  readonly sendQuestionResponse: (response: string) => void;
  readonly reset: () => void;
  readonly stop: () => void;
}

export function useChatActions(
  chatRunId: ChatRunId | null,
): UseChatActionsResult {
  const { sendInput: sendInputForRun } = useChatInputRequests();
  const { sendSteer: sendSteerForRun } = useChatSteering();
  const { sendPermissionDecision: sendPermissionDecisionForRun } =
    useChatPermissionRequests();
  const { sendQuestionResponse: sendQuestionResponseForRun } =
    useChatQuestionRequests();
  const { resetChatRun, stopChatRun } = useChatRunLifecycle();

  const sendInput = useCallback(
    (text: string): void => {
      if (!chatRunId) return;
      sendInputForRun(chatRunId, text);
    },
    [chatRunId, sendInputForRun],
  );

  const sendSteer = useCallback(
    (text: string): void => {
      if (!chatRunId) return;
      sendSteerForRun(chatRunId, text);
    },
    [chatRunId, sendSteerForRun],
  );

  const sendPermissionDecision = useCallback(
    (decision: "allow" | "deny" | "allow-session" | "deny-session"): void => {
      if (!chatRunId) return;
      sendPermissionDecisionForRun(chatRunId, decision);
    },
    [chatRunId, sendPermissionDecisionForRun],
  );

  const sendQuestionResponse = useCallback(
    (response: string): void => {
      if (!chatRunId) return;
      sendQuestionResponseForRun(chatRunId, response);
    },
    [chatRunId, sendQuestionResponseForRun],
  );

  const reset = useCallback((): void => {
    if (!chatRunId) return;
    resetChatRun(chatRunId);
  }, [chatRunId, resetChatRun]);

  const stop = useCallback((): void => {
    if (!chatRunId) return;
    stopChatRun(chatRunId);
  }, [chatRunId, stopChatRun]);

  return {
    sendInput,
    sendSteer,
    sendPermissionDecision,
    sendQuestionResponse,
    reset,
    stop,
  };
}
