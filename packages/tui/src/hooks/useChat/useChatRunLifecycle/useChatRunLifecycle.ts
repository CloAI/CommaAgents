import type { DiscoveredStrategy } from "@comma-agents/core";
import { useCallback } from "react";

import { useDaemonCommand } from "../../useDaemon/useDaemonCommand/useDaemonCommand";
import type { ChatMessage, ChatRun, ChatRunId } from "../useChat.types";
import { createInitialChatRun } from "../useChat.utils";
import { useChatRunStore } from "../useChatRunStore";
import type { ChatRunLifecycle } from "./useChatRunLifecycle.types";

const DAEMON_UNREACHABLE_ERROR =
  "Cannot reach daemon — is it running? Start it with: bun run daemon";

/** Own commands initiated by the user and local run collection management. */
export function useChatRunLifecycle(): ChatRunLifecycle {
  const { chatRuns, setChatRuns, messageCountersRef } = useChatRunStore();
  const prepareRunCommand = useDaemonCommand("prepare_run");
  const stopRunCommand = useDaemonCommand("stop_run");

  const updateChatRun = useCallback(
    (chatRunId: ChatRunId, updater: (chatRun: ChatRun) => ChatRun): void => {
      setChatRuns((previousChatRuns) => {
        const existingChatRun = previousChatRuns.get(chatRunId);
        if (!existingChatRun) return previousChatRuns;
        const updatedChatRun = updater(existingChatRun);
        if (updatedChatRun === existingChatRun) return previousChatRuns;
        const nextChatRuns = new Map(previousChatRuns);
        nextChatRuns.set(chatRunId, {
          ...updatedChatRun,
          updatedAt: Date.now(),
        });
        return nextChatRuns;
      });
    },
    [setChatRuns],
  );

  const startStrategy = useCallback(
    (
      strategyPath: string,
      input?: string,
      cwd?: string,
      manifestPath?: string,
    ): ChatRunId => {
      const chatRunId = crypto.randomUUID();
      const now = Date.now();
      const initialMessages: readonly ChatMessage[] =
        input !== undefined && input.length > 0
          ? [
              {
                id: `${chatRunId}-msg-1`,
                role: "user",
                sender: "you",
                text: input,
                streaming: false,
                timestamp: now,
              },
            ]
          : [];
      const chatRun: ChatRun = {
        ...createInitialChatRun(chatRunId, { strategyPath }),
        status: "pending",
        runStatus: "pending",
        pendingExecution: null,
        messages: initialMessages,
        createdAt: now,
        updatedAt: now,
      };
      messageCountersRef.current.set(chatRunId, initialMessages.length);

      setChatRuns((previousChatRuns) => {
        const nextChatRuns = new Map(previousChatRuns);
        nextChatRuns.set(chatRunId, chatRun);
        return nextChatRuns;
      });
      const requestId = prepareRunCommand({
        runId: chatRunId,
        strategyPath,
        ...(cwd !== undefined ? { cwd } : {}),
        ...(manifestPath !== undefined ? { manifestPath } : {}),
      });

      if (!requestId) {
        updateChatRun(chatRunId, (existingChatRun) => ({
          ...existingChatRun,
          status: "error",
          error: DAEMON_UNREACHABLE_ERROR,
        }));
      } else {
        updateChatRun(chatRunId, (existingChatRun) => ({
          ...existingChatRun,
          pendingExecution: {
            mode: "start",
            input: input ?? null,
            requestId,
          },
        }));
      }

      return chatRunId;
    },
    [messageCountersRef, setChatRuns, prepareRunCommand, updateChatRun],
  );

  const continueRun = useCallback(
    (
      chatRunId: ChatRunId,
      strategy: DiscoveredStrategy,
      input: string,
    ): void => {
      const chatRun = chatRuns.get(chatRunId);
      if (
        !chatRun ||
        chatRun.status !== "completed" ||
        chatRun.daemonRunId === null
      ) {
        return;
      }

      const counter = (messageCountersRef.current.get(chatRunId) ?? 0) + 1;
      messageCountersRef.current.set(chatRunId, counter);
      const userMessage: ChatMessage = {
        id: `${chatRunId}-msg-${counter}`,
        role: "user",
        sender: "you",
        text: input,
        streaming: false,
        timestamp: Date.now(),
      };

      updateChatRun(chatRunId, (existingChatRun) => ({
        ...existingChatRun,
        status: "pending",
        runStatus: "pending",
        error: null,
        strategyPath: strategy.path,
        label: strategy.label,
        messages: [...existingChatRun.messages, userMessage],
      }));

      const requestId = prepareRunCommand({
        runId: chatRun.daemonRunId,
        strategyPath: strategy.path,
        ...(strategy.manifestPath !== undefined
          ? { manifestPath: strategy.manifestPath }
          : {}),
      });

      if (!requestId) {
        const errorCounter =
          (messageCountersRef.current.get(chatRunId) ?? 0) + 1;
        messageCountersRef.current.set(chatRunId, errorCounter);
        updateChatRun(chatRunId, (existingChatRun) => ({
          ...existingChatRun,
          status: "completed",
          runStatus: "completed",
          error: DAEMON_UNREACHABLE_ERROR,
          messages: [
            ...existingChatRun.messages,
            {
              id: `${chatRunId}-msg-${errorCounter}`,
              role: "system",
              sender: "system",
              text: `Error: ${DAEMON_UNREACHABLE_ERROR}`,
              streaming: false,
              timestamp: Date.now(),
            },
          ],
        }));
        return;
      }

      updateChatRun(chatRunId, (existingChatRun) => ({
        ...existingChatRun,
        pendingExecution: {
          mode: "continue",
          input,
          requestId,
        },
      }));
    },
    [chatRuns, messageCountersRef, prepareRunCommand, updateChatRun],
  );

  const stopChatRun = useCallback<ChatRunLifecycle["stopChatRun"]>(
    (chatRunId) => {
      const chatRun = chatRuns.get(chatRunId);
      if (chatRun && chatRun.status !== "idle") {
        stopRunCommand({ runId: chatRun.daemonRunId ?? chatRunId });
      }
    },
    [chatRuns, stopRunCommand],
  );

  const resetChatRun = useCallback<ChatRunLifecycle["resetChatRun"]>(
    (chatRunId) => {
      updateChatRun(chatRunId, (chatRun) => ({
        ...chatRun,
        messages: [],
        status: "idle",
        error: null,
        pendingExecution: null,
        pendingInputAgent: null,
        pendingPermissionRequests: [],
        pendingQuestionRequests: [],
        activeLaunchStrategyIds: [],
        strategyName: null,
        strategyPath: null,
      }));
      messageCountersRef.current.set(chatRunId, 0);
    },
    [messageCountersRef, updateChatRun],
  );

  const removeChatRun = useCallback<ChatRunLifecycle["removeChatRun"]>(
    (chatRunId) => {
      setChatRuns((previousChatRuns) => {
        if (!previousChatRuns.has(chatRunId)) return previousChatRuns;
        const nextChatRuns = new Map(previousChatRuns);
        nextChatRuns.delete(chatRunId);
        return nextChatRuns;
      });
      messageCountersRef.current.delete(chatRunId);
    },
    [messageCountersRef, setChatRuns],
  );

  const clearAllChatRuns = useCallback((): void => {
    setChatRuns(new Map());
    messageCountersRef.current.clear();
  }, [messageCountersRef, setChatRuns]);

  return {
    startStrategy,
    continueRun,
    stopChatRun,
    resetChatRun,
    removeChatRun,
    clearAllChatRuns,
  };
}
