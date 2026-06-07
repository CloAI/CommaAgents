import type { DiscoveredStrategy } from "@comma-agents/core";
import { Box, useFocusManager } from "ink";
import type React from "react";
import { useEffect, useRef } from "react";
import { useLocation, useNavigate } from "react-router";

import {
  ChatTextArea,
  MessageList,
  PermissionPrompt,
  QuestionPrompt,
  StatusBar,
} from "../../components";
import {
  useChatActions,
  useChatLifecycle,
  useChatState,
} from "../../hooks/useChat";
import { useDebugRender } from "../../hooks/useDebugRender";
import type { ChatPageTheme } from "./ChatPage.theme";
import { useChatPageTheme } from "./ChatPage.theme";
import { useDiscoveredStrategies } from "../../hooks/useStrategies/useStrategies";

export interface ChatPageRouteState {
  readonly strategy: DiscoveredStrategy;
  readonly inputText: string;
}

const REPLY_INPUT_ID = "chat-reply";

export function ChatPage(): React.ReactElement {
  const navigate = useNavigate();
  const location = useLocation();
  const routeState = location.state as ChatPageRouteState | null;
  const strategies = useDiscoveredStrategies();

  const chatState = useChatState();
  const chatActions = useChatActions();
  const chatLifecycle = useChatLifecycle();

  const firedRef = useRef<string | null>(null);

  useEffect(() => {
    if (!routeState) return;
    const { strategy, inputText } = routeState;
    const fireKey = `${strategy.path}:${inputText}`;
    if (firedRef.current === fireKey) return;
    firedRef.current = fireKey;

    chatLifecycle.startStrategy(
      strategy.path,
      inputText,
      process.cwd(),
      strategy.manifestPath,
    );
    // navigate(location.pathname, { replace: true, state: null });
  }, [routeState, chatLifecycle, navigate, location.pathname]);

  const debug = useDebugRender("ChatPage", {
    props: {
      chatStatus: chatState.status,
      messages: chatState.messages,
      error: chatState.error,
    },
  });
  const theme = useChatPageTheme();

  return (
    <ChatPageRender
      theme={theme}
      messages={chatState.messages}
      chatStatus={chatState.status}
      error={chatState.error}
      pendingInputAgent={chatState.pendingInputAgent}
      pendingPermissionRequest={chatState.pendingPermissionRequest}
      pendingQuestionRequest={chatState.pendingQuestionRequest}
      onReplySubmit={chatActions.sendInput}
      onSteerSubmit={chatActions.sendSteer}
      onContinueSubmit={chatActions.sendContinue}
      onPermissionDecide={chatActions.sendPermissionDecision}
      onQuestionSubmit={chatActions.sendQuestionResponse}
      strategies={strategies}
      debugRef={debug.ref}
    />
  );
}

export interface ChatPageRenderProps {
  readonly theme: ChatPageTheme;
  readonly messages: readonly import("../../hooks").ChatMessage[];
  readonly chatStatus: import("../../hooks").ChatStatus;
  readonly error: string | null;
  readonly pendingInputAgent: string | null;
  readonly pendingPermissionRequest:
    | import("../../hooks").PendingPermissionRequest
    | null;
  readonly pendingQuestionRequest:
    | import("../../hooks").PendingQuestionRequest
    | null;
  readonly onReplySubmit: (text: string) => void;
  readonly onSteerSubmit: (text: string) => void;
  readonly onContinueSubmit: (strategyPath: string, text: string) => void;
  readonly onPermissionDecide: (
    decision: "allow" | "deny" | "allow-session" | "deny-session",
  ) => void;
  readonly onQuestionSubmit: (response: string) => void;
  readonly strategies: readonly DiscoveredStrategy[];
  readonly debugRef?: React.Ref<import("ink").DOMElement>;
}

export function ChatPageRender({
  theme,
  messages,
  chatStatus,
  error,
  pendingInputAgent,
  pendingPermissionRequest,
  pendingQuestionRequest,
  onReplySubmit,
  onSteerSubmit,
  onContinueSubmit,
  onPermissionDecide,
  onQuestionSubmit,
  // activeStrategy,
  strategies,
  debugRef,
}: ChatPageRenderProps): React.ReactElement {
  const showPermission =
    chatStatus === "waiting_permission" && pendingPermissionRequest !== null;
  const showQuestion =
    chatStatus === "waiting_question" && pendingQuestionRequest !== null;

  const isFinished =
    chatStatus === "completed" ||
    chatStatus === "error" ||
    chatStatus === "cancelled";
  const showComposer = !showPermission && !showQuestion;

  const composerMode: "reply" | "continue" | "steer" =
    chatStatus === "waiting_input"
      ? "reply"
      : isFinished
        ? "continue"
        : "steer";

  const composerPlaceholder =
    composerMode === "reply"
      ? pendingInputAgent
        ? `Reply to ${pendingInputAgent}...`
        : "Type your message..."
      : composerMode === "continue"
        ? "Continue — Tab to switch strategy, Enter to submit..."
        : "Steer the agents...";

  const { focus } = useFocusManager();
  // biome-ignore lint/correctness/useExhaustiveDependencies: composerMode re-triggers focus on phase change
  useEffect(() => {
    if (showComposer) focus(REPLY_INPUT_ID);
  }, [focus, showComposer, composerMode]);

  const handleComposerSubmit = (strategyPath: string, text: string): void => {
    if (composerMode === "reply") {
      onReplySubmit(text);
    } else if (composerMode === "continue") {
      onContinueSubmit(strategyPath, text);
    } else {
      onSteerSubmit(text);
    }
  };

  return (
    <Box ref={debugRef} {...theme.root}>
      <Box {...theme.messageArea}>
        <MessageList messages={messages} />
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
          onSubmit={handleComposerSubmit}
          placeholder={composerPlaceholder}
          showStrategyRow={composerMode === "continue"}
          id={REPLY_INPUT_ID}
        />
      ) : null}

      {/* <StatusBar
        status={chatStatus}
        error={error}
        strategyName={activeStrategy?.label ?? ""}
      /> */}
    </Box>
  );
}
