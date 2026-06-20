import { useCallback } from "react";

import { useDaemonCommand } from "../../useDaemon/useDaemonCommand/useDaemonCommand";
import { useDaemonSubscription } from "../../useDaemon/useDaemonSubscription/useDaemonSubscription";
import type { ChatMessage } from "../useChat.types";
import {
  createLocalChatMessageId,
  getActiveLaunchStrategyId,
} from "../useChat.utils";
import { useChatRunStore } from "../useChatRunStore";
import type { ChatSteeringResult } from "./useChatSteering.types";

/** Send steering messages to live chat runs. */
export function useChatSteering(subscribeToDaemon = false): ChatSteeringResult {
  const { chatRuns, setChatRuns } = useChatRunStore();
  const steerRunCommand = useDaemonCommand("steer_run");

  const sendSteer = useCallback<ChatSteeringResult["sendSteer"]>(
    (chatRunId, text) => {
      const chatRun = chatRuns.get(chatRunId);
      if (!chatRun?.daemonRunId) return;
      if (chatRun.status !== "running" && chatRun.status !== "pending") return;
      steerRunCommand({ runId: chatRun.daemonRunId, text });
    },
    [chatRuns, steerRunCommand],
  );

  useDaemonSubscription(
    "steer_queued",
    (message) => {
      setChatRuns((previousChatRuns) => {
        const chatRun = previousChatRuns.get(message.runId);
        if (!chatRun) return previousChatRuns;
        const chatRunId = chatRun.id;
        const parentToolCallId = getActiveLaunchStrategyId(chatRun);
        const steerMessage: ChatMessage = {
          id: createLocalChatMessageId(chatRunId),
          role: "user",
          sender: "you",
          text: message.text,
          streaming: false,
          ...(parentToolCallId !== undefined ? { parentToolCallId } : {}),
          timestamp: Date.now(),
        };
        const nextChatRuns = new Map(previousChatRuns);
        nextChatRuns.set(chatRunId, {
          ...chatRun,
          messages: [...chatRun.messages, steerMessage],
          updatedAt: Date.now(),
        });
        return nextChatRuns;
      });
    },
    null,
    subscribeToDaemon,
  );

  return { sendSteer };
}
