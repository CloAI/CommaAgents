import type { DiscoveredStrategy } from "@comma-agents/core";
import type {
  RequestPermissionMessage,
  RequestQuestionMessage,
} from "@comma-agents/daemon";
import { Box, useFocusManager, useInput } from "ink";
import type React from "react";
import { useCallback, useContext, useEffect, useRef } from "react";
import { useNavigate, useParams } from "react-router";
import {
  ChatTextArea,
  MessageList,
  PermissionPrompt,
  QuestionPrompt,
} from "../../components";
import {
  useChatInputRequests,
  useChatPermissionRequests,
  useChatQuestionRequests,
  useChatRunLifecycle,
  useChatState,
  useChatSteering,
} from "../../hooks/useChat";
import { ModalContext } from "../../hooks/useModal/useModal.context";
import {
  useDiscoveredStrategies,
  useStrategyDiscoveryStatus,
} from "../../hooks/useStrategies/useStrategies";
import { isMouseEscape } from "../../utils/mouseEscape";
import { DOUBLE_ESCAPE_WINDOW_MS, REPLY_INPUT_ID } from "./ChatPage.constants";
import type { ChatPageTheme } from "./ChatPage.theme";
import { useChatPageTheme } from "./ChatPage.theme";

export function ChatPage(): React.ReactElement {
  const { chatRunId = "" } = useParams<{ chatRunId: string }>();
  const navigate = useNavigate();
  const strategies = useDiscoveredStrategies();
  const strategyDiscovery = useStrategyDiscoveryStatus();
  const chatState = useChatState(chatRunId);

  const { continueRun, stopChatRun } = useChatRunLifecycle();
  const { sendInput } = useChatInputRequests();
  const { sendSteer } = useChatSteering();
  const { sendPermissionDecision } = useChatPermissionRequests();
  const { sendQuestionResponse } = useChatQuestionRequests();

  const theme = useChatPageTheme();

  const handleOpenSubStrategy = useCallback(
    (toolCallId: string): void => {
      navigate(
        `/chat/${encodeURIComponent(chatRunId)}/spawned/${encodeURIComponent(toolCallId)}`,
      );
    },
    [chatRunId, navigate],
  );
  const handleReplySubmit = useCallback(
    (text: string): void => {
      sendInput(chatRunId, text);
    },
    [chatRunId, sendInput],
  );
  const handleSteerSubmit = useCallback(
    (text: string): void => {
      sendSteer(chatRunId, text);
    },
    [chatRunId, sendSteer],
  );
  const handleContinueSubmit = useCallback(
    (strategy: DiscoveredStrategy, text: string): void => {
      continueRun(chatRunId, strategy, text);
    },
    [chatRunId, continueRun],
  );
  const handlePermissionDecide = useCallback(
    (decision: "allow" | "deny" | "allow-session" | "deny-session"): void => {
      sendPermissionDecision(chatRunId, decision);
    },
    [chatRunId, sendPermissionDecision],
  );
  const handleQuestionSubmit = useCallback(
    (response: string): void => {
      sendQuestionResponse(chatRunId, response);
    },
    [chatRunId, sendQuestionResponse],
  );
  const handleAbort = useCallback((): void => {
    stopChatRun(chatRunId);
  }, [chatRunId, stopChatRun]);

  return (
    <ChatPageRender
      theme={theme}
      messages={chatState.messages}
      chatStatus={chatState.status}
      error={chatState.error}
      pendingInputAgent={chatState.pendingInputAgent}
      pendingPermissionRequest={chatState.pendingPermissionRequest}
      pendingQuestionRequest={chatState.pendingQuestionRequest}
      activeStrategyPath={chatState.strategyPath}
      canContinue={chatState.runId !== null}
      onReplySubmit={handleReplySubmit}
      onSteerSubmit={handleSteerSubmit}
      onContinueSubmit={handleContinueSubmit}
      onPermissionDecide={handlePermissionDecide}
      onQuestionSubmit={handleQuestionSubmit}
      onAbort={handleAbort}
      onOpenSubStrategy={handleOpenSubStrategy}
      strategies={strategies}
      emptyStrategyLabel={
        strategyDiscovery.status === "loading"
          ? "Loading strategies..."
          : "No strategies found"
      }
      emptyStrategyPlaceholder={
        strategyDiscovery.error ?? "No bundled or user strategies were found."
      }
    />
  );
}

export interface ChatPageRenderProps {
  readonly theme: ChatPageTheme;
  readonly messages: readonly import("../../hooks").ChatMessage[];
  readonly chatStatus: import("../../hooks").ChatStatus;
  readonly error: string | null;
  readonly pendingInputAgent: string | null;
  readonly pendingPermissionRequest: RequestPermissionMessage | null;
  readonly pendingQuestionRequest: RequestQuestionMessage | null;
  readonly activeStrategyPath: string | null;
  readonly canContinue: boolean;
  readonly strategies: readonly DiscoveredStrategy[];
  readonly emptyStrategyLabel: string;
  readonly emptyStrategyPlaceholder: string;
  readonly onReplySubmit: (text: string) => void;
  readonly onSteerSubmit: (text: string) => void;
  readonly onContinueSubmit: (
    strategy: DiscoveredStrategy,
    text: string,
  ) => void;
  readonly onPermissionDecide: (
    decision: "allow" | "deny" | "allow-session" | "deny-session",
  ) => void;
  readonly onQuestionSubmit: (response: string) => void;
  readonly onAbort: () => void;
  readonly onOpenSubStrategy?: (toolCallId: string) => void;
}

export function ChatPageRender({
  theme,
  messages,
  chatStatus,
  error: _error,
  pendingInputAgent,
  pendingPermissionRequest,
  pendingQuestionRequest,
  activeStrategyPath,
  canContinue,
  onReplySubmit,
  onSteerSubmit,
  onContinueSubmit,
  onPermissionDecide,
  onQuestionSubmit,
  onAbort,
  strategies,
  emptyStrategyLabel,
  emptyStrategyPlaceholder,
  onOpenSubStrategy,
}: ChatPageRenderProps): React.ReactElement {
  const showPermission =
    chatStatus === "waiting_permission" && pendingPermissionRequest !== null;
  const showQuestion =
    chatStatus === "waiting_question" && pendingQuestionRequest !== null;

  const isFinished =
    chatStatus === "completed" ||
    chatStatus === "error" ||
    chatStatus === "cancelled";
  const { openStack } = useContext(ModalContext);
  const abortShortcutActive = !isFinished && openStack.length === 0;
  const lastEscapeAtRef = useRef<number | null>(null);

  useInput(
    (input, key) => {
      if (isMouseEscape(input)) return;
      if (!key.escape) {
        lastEscapeAtRef.current = null;
        return;
      }

      const now = Date.now();
      const lastEscapeAt = lastEscapeAtRef.current;
      if (
        lastEscapeAt !== null &&
        now - lastEscapeAt <= DOUBLE_ESCAPE_WINDOW_MS
      ) {
        lastEscapeAtRef.current = null;
        onAbort();
        return;
      }

      lastEscapeAtRef.current = now;
    },
    { isActive: abortShortcutActive },
  );

  useEffect(() => {
    if (!abortShortcutActive) lastEscapeAtRef.current = null;
  }, [abortShortcutActive]);

  const showComposer =
    !showPermission &&
    !showQuestion &&
    (!isFinished || (chatStatus === "completed" && canContinue));

  const composerMode: "continue" | "reply" | "steer" =
    chatStatus === "completed"
      ? "continue"
      : chatStatus === "waiting_input"
        ? "reply"
        : "steer";

  const composerPlaceholder =
    composerMode === "continue"
      ? "Continue the conversation..."
      : composerMode === "reply"
        ? pendingInputAgent
          ? `Reply to ${pendingInputAgent}...`
          : "Type your message..."
        : "Steer the agents...";

  const { focus } = useFocusManager();
  useEffect(() => {
    if (showComposer) focus(REPLY_INPUT_ID);
  }, [focus, showComposer]);

  const handleComposerSubmit = (
    strategy: DiscoveredStrategy,
    text: string,
  ): void => {
    if (composerMode === "continue") {
      onContinueSubmit(strategy, text);
    } else if (composerMode === "reply") {
      onReplySubmit(text);
    } else {
      onSteerSubmit(text);
    }
  };

  return (
    <Box {...theme.root}>
      <Box {...theme.messageArea}>
        <MessageList
          messages={messages}
          onOpenSubStrategy={onOpenSubStrategy}
        />
      </Box>

      {showPermission && pendingPermissionRequest ? (
        <PermissionPrompt
          request={pendingPermissionRequest}
          onDecide={onPermissionDecide}
        />
      ) : showQuestion && pendingQuestionRequest ? (
        <QuestionPrompt
          request={pendingQuestionRequest}
          onSubmit={onQuestionSubmit}
        />
      ) : showComposer ? (
        <ChatTextArea
          strategies={strategies}
          initialStrategyPath={activeStrategyPath ?? undefined}
          onSubmit={handleComposerSubmit}
          placeholder={composerPlaceholder}
          emptyStrategyLabel={emptyStrategyLabel}
          emptyPlaceholder={emptyStrategyPlaceholder}
          showStrategyRow={composerMode === "continue"}
          id={REPLY_INPUT_ID}
        />
      ) : null}
    </Box>
  );
}
