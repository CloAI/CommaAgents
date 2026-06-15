import { useCallback } from "react";

import { useDaemonCommand } from "../../useDaemon/useDaemonCommand/useDaemonCommand";
import { useDaemonSubscription } from "../../useDaemon/useDaemonSubscription/useDaemonSubscription";
import type { ChatMessage } from "../useChat.types";
import { getActiveLaunchStrategyId } from "../useChat.utils";
import { useChatRunStore } from "../useChatRunStore";
import type { ChatInputRequestResult } from "./useChatInputRequests.types";

/** Submit user input for a pending daemon input request. */
export function useChatInputRequests(
  subscribeToDaemon = false,
): ChatInputRequestResult {
  const { setChatRuns, messageCountersRef } = useChatRunStore();
  const sendUserInputCommand = useDaemonCommand("user_input");

  const sendInput = useCallback<ChatInputRequestResult["sendInput"]>(
    (chatRunId, text) => {
      setChatRuns((previousChatRuns) => {
        const chatRun = previousChatRuns.get(chatRunId);
        if (!chatRun?.daemonRunId || !chatRun.pendingInputAgent) {
          return previousChatRuns;
        }
        const counter = (messageCountersRef.current.get(chatRunId) ?? 0) + 1;
        messageCountersRef.current.set(chatRunId, counter);
        const parentToolCallId = getActiveLaunchStrategyId(chatRun);
        const userMessage: ChatMessage = {
          id: `${chatRunId}-msg-${counter}`,
          role: "user",
          sender: "you",
          text,
          streaming: false,
          ...(parentToolCallId !== undefined ? { parentToolCallId } : {}),
          timestamp: Date.now(),
        };
        sendUserInputCommand({
          runId: chatRun.daemonRunId,
          agentName: chatRun.pendingInputAgent,
          text,
        });
        const nextChatRuns = new Map(previousChatRuns);
        nextChatRuns.set(chatRunId, {
          ...chatRun,
          messages: [...chatRun.messages, userMessage],
          pendingInputAgent: null,
          status: "running",
          updatedAt: Date.now(),
        });
        return nextChatRuns;
      });
    },
    [messageCountersRef, sendUserInputCommand, setChatRuns],
  );

  useDaemonSubscription(
    "request_input",
    (message) => {
      setChatRuns((previousChatRuns) => {
        const chatRun = previousChatRuns.get(message.runId);
        if (!chatRun) return previousChatRuns;
        const chatRunId = chatRun.id;
        let updatedMessages = chatRun.messages;
        if (message.prompt) {
          const counter = (messageCountersRef.current.get(chatRunId) ?? 0) + 1;
          messageCountersRef.current.set(chatRunId, counter);
          const parentToolCallId = getActiveLaunchStrategyId(chatRun);
          updatedMessages = [
            ...chatRun.messages,
            {
              id: `${chatRunId}-msg-${counter}`,
              role: "system",
              sender: "system",
              text: message.prompt,
              streaming: false,
              ...(parentToolCallId !== undefined ? { parentToolCallId } : {}),
              timestamp: Date.now(),
            },
          ];
        }
        const nextChatRuns = new Map(previousChatRuns);
        nextChatRuns.set(chatRunId, {
          ...chatRun,
          status: "waiting_input",
          pendingInputAgent: message.agentName,
          messages: updatedMessages,
          updatedAt: Date.now(),
        });
        return nextChatRuns;
      });
    },
    null,
    subscribeToDaemon,
  );

  return { sendInput };
}
