import { Box, Text } from "ink";
import type React from "react";

import { ChatTextArea, MessageList, PermissionPrompt, Separator, StatusBar } from "../../components";
import type { PermissionDecision } from "../../components/PermissionPrompt";
import type { StrategyOption } from "../../components/StrategyPicker";
import type { ChatMessage, ChatStatus, PendingPermissionRequest } from "../../hooks";
import { useDebugRender } from "../../hooks/useDebugRender";
import type { ChatPageTheme } from "./ChatPage.theme";
import { useChatPageTheme } from "./ChatPage.theme";

export interface ChatPageProps {
  /** Chat messages to display. */
  readonly messages: readonly ChatMessage[];
  /** Current chat lifecycle status. */
  readonly chatStatus: ChatStatus;
  /** Current error message, or null. */
  readonly error: string | null;
  /** Agent waiting for user input, or null. */
  readonly pendingInputAgent: string | null;
  /** Pending permission request, or null. */
  readonly pendingPermissionRequest: PendingPermissionRequest | null;
  /** Called when the user submits a reply to an agent. */
  readonly onReplySubmit: (text: string) => void;
  /** Called when the user resolves a permission prompt. */
  readonly onPermissionDecide: (decision: PermissionDecision) => void;
  /** The active strategy option for this chat. */
  readonly activeStrategy: StrategyOption;
}

export function ChatPage({
  messages,
  chatStatus,
  error,
  pendingInputAgent,
  pendingPermissionRequest,
  onReplySubmit,
  onPermissionDecide,
  activeStrategy,
}: ChatPageProps): React.ReactElement {
  const debug = useDebugRender("ChatPage", { props: { chatStatus, messages, error } });
  const theme = useChatPageTheme();

  return (
    <ChatPageRender
      theme={theme}
      messages={messages}
      chatStatus={chatStatus}
      error={error}
      pendingInputAgent={pendingInputAgent}
      pendingPermissionRequest={pendingPermissionRequest}
      onReplySubmit={onReplySubmit}
      onPermissionDecide={onPermissionDecide}
      activeStrategy={activeStrategy}
      debugRef={debug.ref}
    />
  );
}

export interface ChatPageRenderProps {
  /** Resolved theme style objects. */
  readonly theme: ChatPageTheme;
  /** Chat messages to display. */
  readonly messages: readonly ChatMessage[];
  /** Current chat lifecycle status. */
  readonly chatStatus: ChatStatus;
  /** Current error message, or null. */
  readonly error: string | null;
  /** Agent waiting for user input, or null. */
  readonly pendingInputAgent: string | null;
  /** Pending permission request, or null. */
  readonly pendingPermissionRequest: PendingPermissionRequest | null;
  /** Called when the user submits a reply to an agent. */
  readonly onReplySubmit: (text: string) => void;
  /** Called when the user resolves a permission prompt. */
  readonly onPermissionDecide: (decision: PermissionDecision) => void;
  /** The active strategy option for this chat. */
  readonly activeStrategy: StrategyOption;
  /** Debug render ref. */
  readonly debugRef?: React.Ref<import("ink").DOMElement>;
}

export function ChatPageRender({
  theme,
  messages,
  chatStatus,
  error,
  pendingInputAgent,
  pendingPermissionRequest,
  onReplySubmit,
  onPermissionDecide,
  activeStrategy,
  debugRef,
}: ChatPageRenderProps): React.ReactElement {
  const showInput = chatStatus === "waiting_input";
  const showPermission = chatStatus === "waiting_permission" && pendingPermissionRequest !== null;
  const replyPlaceholder = pendingInputAgent
    ? `Reply to ${pendingInputAgent}...`
    : "Type your message...";

  // ChatTextArea emits (strategyPath, input); the active strategy is fixed here,
  // so we discard the first argument and forward the text to the reply handler.
  const handleChatTextAreaSubmit = (_strategyPath: string, text: string): void => {
    onReplySubmit(text);
  };

  return (
    <Box ref={debugRef} {...theme.root}>
      <Box {...theme.header}>
        <Text {...theme.header.title}>{activeStrategy.label}</Text>
      </Box>

      <Separator />

      <Box {...theme.messageArea}>
        <MessageList messages={messages} />
      </Box>

      <Separator />

      {showPermission && pendingPermissionRequest ? (
        <PermissionPrompt request={pendingPermissionRequest} onDecide={onPermissionDecide} />
      ) : showInput ? (
        <ChatTextArea
          strategies={[activeStrategy]}
          onSubmit={handleChatTextAreaSubmit}
          placeholder={replyPlaceholder}
        />
      ) : null}

      <StatusBar status={chatStatus} error={error} strategyName={activeStrategy.label} />

      <Box {...theme.footer}>
        <Text {...theme.footer.text}>ctrl+c exit | ctrl+r reset | ctrl+p commands</Text>
      </Box>
    </Box>
  );
}
