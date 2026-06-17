import { useDaemonCommand } from "../../useDaemon/useDaemonCommand/useDaemonCommand";
import { useDaemonSubscription } from "../../useDaemon/useDaemonSubscription/useDaemonSubscription";
import type { ChatMessage } from "../useChat.types";
import { conversationRecordsToChatMessages } from "../useChat.utils";
import { useChatRunStore } from "../useChatRunStore";

/** Project daemon run lifecycle events into local chat runs. */
export function useChatRunLifecycleSubscriptions(): void {
  const { chatRuns, setChatRuns, messageCountersRef } = useChatRunStore();
  const subscribeCommand = useDaemonCommand("subscribe");
  const startRunCommand = useDaemonCommand("start_run");
  const continueRunCommand = useDaemonCommand("continue_run");

  const failPendingExecution = (chatRunId: string, message: string): void => {
    setChatRuns((previousChatRuns) => {
      const chatRun = previousChatRuns.get(chatRunId);
      if (!chatRun?.pendingExecution) return previousChatRuns;

      const isContinuation = chatRun.pendingExecution.mode === "continue";
      const nextChatRuns = new Map(previousChatRuns);
      if (!isContinuation) {
        nextChatRuns.set(chatRunId, {
          ...chatRun,
          status: "error",
          runStatus: "error",
          error: message,
          pendingExecution: null,
          updatedAt: Date.now(),
        });
        return nextChatRuns;
      }

      const counter = (messageCountersRef.current.get(chatRunId) ?? 0) + 1;
      messageCountersRef.current.set(chatRunId, counter);
      const systemMessage: ChatMessage = {
        id: `${chatRunId}-msg-${counter}`,
        role: "system",
        sender: "system",
        text: `Error: ${message}`,
        streaming: false,
        timestamp: Date.now(),
      };
      nextChatRuns.set(chatRunId, {
        ...chatRun,
        status: "completed",
        runStatus: "completed",
        error: message,
        pendingExecution: null,
        messages: [...chatRun.messages, systemMessage],
        updatedAt: Date.now(),
      });
      return nextChatRuns;
    });
  };

  useDaemonSubscription("run_prepared", (message) => {
    const chatRun = chatRuns.get(message.runId);
    const pendingExecution = chatRun?.pendingExecution;
    if (!pendingExecution && chatRun) {
      const hydratedMessages = conversationRecordsToChatMessages(
        message.runId,
        message.conversation.records,
      );
      messageCountersRef.current.set(message.runId, hydratedMessages.length);
      setChatRuns((previousChatRuns) => {
        const existingChatRun = previousChatRuns.get(message.runId);
        if (!existingChatRun) return previousChatRuns;
        const nextChatRuns = new Map(previousChatRuns);
        nextChatRuns.set(message.runId, {
          ...existingChatRun,
          daemonRunId: message.runId,
          label: message.strategyName,
          strategyName: message.strategyName,
          messages: hydratedMessages,
          updatedAt: Date.now(),
        });
        return nextChatRuns;
      });
      return;
    }

    if (
      !pendingExecution ||
      (message.requestId !== undefined &&
        pendingExecution.requestId !== message.requestId)
    ) {
      return;
    }

    const executionRequestId =
      pendingExecution.mode === "continue"
        ? continueRunCommand({
            runId: message.runId,
            input: pendingExecution.input ?? "",
          })
        : startRunCommand({
            runId: message.runId,
            ...(pendingExecution.input !== null
              ? { input: pendingExecution.input }
              : {}),
          });

    if (!executionRequestId) {
      failPendingExecution(
        message.runId,
        `Cannot ${pendingExecution.mode} run because the daemon is unreachable.`,
      );
      return;
    }

    setChatRuns((previousChatRuns) => {
      const chatRun = previousChatRuns.get(message.runId);
      if (!chatRun) return previousChatRuns;
      const hydratedMessages = conversationRecordsToChatMessages(
        message.runId,
        message.conversation.records,
      );
      if (hydratedMessages.length > 0) {
        messageCountersRef.current.set(message.runId, hydratedMessages.length);
      }

      const nextChatRuns = new Map(previousChatRuns);
      nextChatRuns.set(message.runId, {
        ...chatRun,
        daemonRunId: message.runId,
        label: message.strategyName,
        strategyName: message.strategyName,
        messages:
          hydratedMessages.length > 0 ? hydratedMessages : chatRun.messages,
        pendingExecution: {
          ...pendingExecution,
          requestId: executionRequestId,
        },
        updatedAt: Date.now(),
      });
      return nextChatRuns;
    });
  });

  useDaemonSubscription("strategy_started", (message) => {
    subscribeCommand({ runId: message.runId });
    setChatRuns((previousChatRuns) => {
      const chatRun = previousChatRuns.get(message.runId);
      if (!chatRun) return previousChatRuns;

      const counter = (messageCountersRef.current.get(message.runId) ?? 0) + 1;
      messageCountersRef.current.set(message.runId, counter);
      const systemMessage: ChatMessage = {
        id: `${message.runId}-msg-${counter}`,
        role: "system",
        sender: "system",
        text: `Strategy "${message.strategyName}" started (agents: ${message.agents.join(", ")})`,
        streaming: false,
        timestamp: Date.now(),
      };
      const nextChatRuns = new Map(previousChatRuns);
      nextChatRuns.set(message.runId, {
        ...chatRun,
        daemonRunId: message.runId,
        runStatus: "running",
        status: "running",
        label: message.strategyName,
        strategyName: message.strategyName,
        error: null,
        pendingExecution: null,
        messages: [...chatRun.messages, systemMessage],
        updatedAt: Date.now(),
      });
      return nextChatRuns;
    });
  });

  useDaemonSubscription("strategy_completed", (message) => {
    setChatRuns((previousChatRuns) => {
      const chatRun = previousChatRuns.get(message.runId);
      if (!chatRun) return previousChatRuns;
      const chatRunId = chatRun.id;
      const counter = (messageCountersRef.current.get(chatRunId) ?? 0) + 1;
      messageCountersRef.current.set(chatRunId, counter);
      const systemMessage: ChatMessage = {
        id: `${chatRunId}-msg-${counter}`,
        role: "system",
        sender: "system",
        text: "Strategy completed.",
        streaming: false,
        timestamp: Date.now(),
      };
      const nextChatRuns = new Map(previousChatRuns);
      nextChatRuns.set(chatRunId, {
        ...chatRun,
        status: "completed",
        runStatus: "completed",
        pendingPermissionRequests: [],
        pendingQuestionRequests: [],
        activeLaunchStrategyIds: [],
        messages: [...chatRun.messages, systemMessage],
        updatedAt: Date.now(),
      });
      return nextChatRuns;
    });
  });

  useDaemonSubscription("strategy_error", (message) => {
    setChatRuns((previousChatRuns) => {
      const chatRun = previousChatRuns.get(message.runId);
      if (!chatRun) return previousChatRuns;
      const chatRunId = chatRun.id;
      const counter = (messageCountersRef.current.get(chatRunId) ?? 0) + 1;
      messageCountersRef.current.set(chatRunId, counter);
      const systemMessage: ChatMessage = {
        id: `${chatRunId}-msg-${counter}`,
        role: "system",
        sender: "system",
        text: `Error: ${message.error.message}`,
        streaming: false,
        timestamp: Date.now(),
      };
      const nextChatRuns = new Map(previousChatRuns);
      nextChatRuns.set(chatRunId, {
        ...chatRun,
        status: "error",
        runStatus: "error",
        error: message.error.message,
        activeLaunchStrategyIds: [],
        messages: [...chatRun.messages, systemMessage],
        updatedAt: Date.now(),
      });
      return nextChatRuns;
    });
  });

  useDaemonSubscription("error", (message) => {
    const correlatedRun = message.requestId
      ? Array.from(chatRuns.entries()).find(
          ([, chatRun]) =>
            chatRun.pendingExecution?.requestId === message.requestId,
        )
      : undefined;
    if (!correlatedRun) return;
    failPendingExecution(correlatedRun[0], message.message);
  });
}
