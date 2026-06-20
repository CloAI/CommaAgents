import { useDaemonSubscription } from "../../useDaemon/useDaemonSubscription/useDaemonSubscription";
import type { ChatMessage } from "../useChat.types";
import {
  createLocalChatMessageId,
  getActiveLaunchStrategyId,
} from "../useChat.utils";
import { useChatRunStore } from "../useChatRunStore";

/** Project daemon step lifecycle events into system chat messages. */
export function useChatStepMessages(): void {
  const { setChatRuns } = useChatRunStore();

  useDaemonSubscription("step_started", (message) => {
    setChatRuns((previousChatRuns) => {
      const chatRun = previousChatRuns.get(message.runId);
      if (!chatRun) return previousChatRuns;
      const chatRunId = chatRun.id;
      const parentToolCallId = getActiveLaunchStrategyId(chatRun);
      const systemMessage: ChatMessage = {
        id: createLocalChatMessageId(chatRunId),
        role: "system",
        sender: "system",
        text: `[${message.stepName}] started`,
        streaming: false,
        ...(parentToolCallId !== undefined ? { parentToolCallId } : {}),
        timestamp: Date.now(),
      };
      const nextChatRuns = new Map(previousChatRuns);
      nextChatRuns.set(chatRunId, {
        ...chatRun,
        messages: [...chatRun.messages, systemMessage],
        updatedAt: Date.now(),
      });
      return nextChatRuns;
    });
  });

  useDaemonSubscription("step_completed", (message) => {
    setChatRuns((previousChatRuns) => {
      const chatRun = previousChatRuns.get(message.runId);
      if (!chatRun) return previousChatRuns;
      const chatRunId = chatRun.id;
      const parentToolCallId = getActiveLaunchStrategyId(chatRun);
      const systemMessage: ChatMessage = {
        id: createLocalChatMessageId(chatRunId),
        role: "system",
        sender: "system",
        text: `[${message.stepName}] completed`,
        streaming: false,
        ...(parentToolCallId !== undefined ? { parentToolCallId } : {}),
        timestamp: Date.now(),
      };
      const nextChatRuns = new Map(previousChatRuns);
      nextChatRuns.set(chatRunId, {
        ...chatRun,
        messages: [...chatRun.messages, systemMessage],
        updatedAt: Date.now(),
      });
      return nextChatRuns;
    });
  });
}
