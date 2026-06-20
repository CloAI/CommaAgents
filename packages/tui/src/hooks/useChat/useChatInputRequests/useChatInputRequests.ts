import { useCallback } from "react";

import { useDaemonCommand } from "../../useDaemon/useDaemonCommand/useDaemonCommand";
import { useDaemonSubscription } from "../../useDaemon/useDaemonSubscription/useDaemonSubscription";
import type { ChatMessage } from "../useChat.types";
import {
  createLocalChatMessageId,
  getActiveLaunchStrategyId,
} from "../useChat.utils";
import { useChatRunStore } from "../useChatRunStore";
import type { ChatInputRequestResult } from "./useChatInputRequests.types";

/** Submit user input for a pending daemon input request. */
export function useChatInputRequests(
  subscribeToDaemon = false,
): ChatInputRequestResult {
  const { setChatRuns } = useChatRunStore();
  const sendUserInputCommand = useDaemonCommand("user_input");

  const sendInput = useCallback<ChatInputRequestResult["sendInput"]>(
    (chatRunId, text) => {
      setChatRuns((previousChatRuns) => {
        const chatRun = previousChatRuns.get(chatRunId);
        if (!chatRun?.daemonRunId || !chatRun.pendingInputAgent) {
          return previousChatRuns;
        }
        const parentToolCallId = getActiveLaunchStrategyId(chatRun);
        const userMessage: ChatMessage = {
          id: createLocalChatMessageId(chatRunId),
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
    [sendUserInputCommand, setChatRuns],
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
          const parentToolCallId = getActiveLaunchStrategyId(chatRun);
          updatedMessages = [
            ...chatRun.messages,
            {
              id: createLocalChatMessageId(chatRunId),
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
