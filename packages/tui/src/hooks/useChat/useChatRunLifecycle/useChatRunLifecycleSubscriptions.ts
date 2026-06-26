import { useDaemonCommand } from "../../useDaemon/useDaemonCommand/useDaemonCommand";
import { useDaemonSubscription } from "../../useDaemon/useDaemonSubscription/useDaemonSubscription";
import type { ChatMessage, ChatRun } from "../useChat.types";
import {
  conversationRecordsToChatMessages,
  createLocalChatMessageId,
} from "../useChat.utils";
import { useChatRunStore } from "../useChatRunStore";

/** Project daemon run lifecycle events into local chat runs. */
export function useChatRunLifecycleSubscriptions(): void {
  const { chatRuns, setChatRuns } = useChatRunStore();
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

      const systemMessage: ChatMessage = {
        id: createLocalChatMessageId(chatRunId),
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
    const mcpServers = message.mcpServers ?? [];
    const chatRun = chatRuns.get(message.runId);
    const pendingExecution = chatRun?.pendingExecution;
    if (!pendingExecution && chatRun) {
      const hydratedMessages = conversationRecordsToChatMessages(
        message.runId,
        message.conversation.records,
        message.conversation.retentionEvents,
        message.conversation.inputs,
      );
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
          mcpServers,
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

    const failedMcpServers = mcpServers.filter(
      (server) => server.enabled && server.connected === false,
    );
    if (failedMcpServers.length > 0) {
      setChatRuns((previousChatRuns) => {
        const existingChatRun = previousChatRuns.get(message.runId);
        if (!existingChatRun) return previousChatRuns;
        const nextChatRuns = new Map(previousChatRuns);
        nextChatRuns.set(message.runId, {
          ...existingChatRun,
          daemonRunId: message.runId,
          label: message.strategyName,
          strategyName: message.strategyName,
          mcpServers,
          pendingMcpConfirmation: true,
          updatedAt: Date.now(),
        });
        return nextChatRuns;
      });
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
        message.conversation.retentionEvents,
        message.conversation.inputs,
      );
      const nextMessages =
        pendingExecution.mode === "continue"
          ? mergeContinuationMessages(chatRun, hydratedMessages)
          : hydratedMessages.length > 0
            ? hydratedMessages
            : chatRun.messages;

      const nextChatRuns = new Map(previousChatRuns);
      nextChatRuns.set(message.runId, {
        ...chatRun,
        daemonRunId: message.runId,
        label: message.strategyName,
        strategyName: message.strategyName,
        mcpServers,
        pendingMcpConfirmation: false,
        messages: nextMessages,
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

      const systemMessage: ChatMessage = {
        id: createLocalChatMessageId(message.runId),
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
        pendingMcpConfirmation: false,
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
      const systemMessage: ChatMessage = {
        id: createLocalChatMessageId(chatRunId),
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
      const systemMessage: ChatMessage = {
        id: createLocalChatMessageId(chatRunId),
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

/** Preserve the queued continuation prompt when daemon hydration replays prior records. */
function mergeContinuationMessages(
  chatRun: ChatRun,
  hydratedMessages: readonly ChatMessage[],
): readonly ChatMessage[] {
  const queuedMessageId = chatRun.pendingExecution?.queuedMessageId;
  if (queuedMessageId === undefined) {
    return hydratedMessages.length > 0 ? hydratedMessages : chatRun.messages;
  }

  const queuedMessageIndex = chatRun.messages.findIndex(
    (chatMessage) => chatMessage.id === queuedMessageId,
  );
  if (queuedMessageIndex < 0) {
    return hydratedMessages.length > 0 ? hydratedMessages : chatRun.messages;
  }

  const queuedMessage = chatRun.messages[queuedMessageIndex]!;
  if (queuedMessageIndex > 0) return chatRun.messages;
  return hydratedMessages.length > 0
    ? [...hydratedMessages, queuedMessage]
    : chatRun.messages;
}
