import { useDaemonSubscription } from "../../useDaemon/useDaemonSubscription/useDaemonSubscription";
import type { ChatMessage } from "../useChat.types";
import { getActiveLaunchStrategyId } from "../useChat.utils";
import { useChatRunStore } from "../useChatRunStore";

/** Project daemon step lifecycle events into system chat messages. */
export function useChatStepMessages(): void {
  const { setChatRuns, messageCountersRef } = useChatRunStore();

  useDaemonSubscription("step_started", (message) => {
    setChatRuns((previousChatRuns) => {
      const chatRun = previousChatRuns.get(message.runId);
      if (!chatRun) return previousChatRuns;
      const chatRunId = chatRun.id;
      const counter = (messageCountersRef.current.get(chatRunId) ?? 0) + 1;
      messageCountersRef.current.set(chatRunId, counter);
      const parentToolCallId = getActiveLaunchStrategyId(chatRun);
      const systemMessage: ChatMessage = {
        id: `${chatRunId}-msg-${counter}`,
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
      const counter = (messageCountersRef.current.get(chatRunId) ?? 0) + 1;
      messageCountersRef.current.set(chatRunId, counter);
      const parentToolCallId = getActiveLaunchStrategyId(chatRun);
      const systemMessage: ChatMessage = {
        id: `${chatRunId}-msg-${counter}`,
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
