import { Box, useFocusManager } from "ink";
import type React from "react";
import { useEffect } from "react";

import {
  ChatTextArea,
  MessageList,
  PermissionPrompt,
  QuestionPrompt,
  StatusBar,
} from "../../components";
import type { PermissionDecision } from "../../components/PermissionPrompt";
import type { StrategyOption } from "../../components/StrategyPicker";
import type {
  ChatMessage,
  ChatStatus,
  PendingPermissionRequest,
  PendingQuestionRequest,
} from "../../hooks";
import { useDebugRender } from "../../hooks/useDebugRender";
import type { ChatPageTheme } from "./ChatPage.theme";
import { useChatPageTheme } from "./ChatPage.theme";

/**
 * Ink focus-manager id for the reply input. Stable so we can target it with
 * `focus(...)` from effects when the agent re-prompts the user.
 */
const REPLY_INPUT_ID = "chat-reply";

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
  /** Pending question request, or null. */
  readonly pendingQuestionRequest: PendingQuestionRequest | null;
  /** Whether this run is a read-only replay (composer hidden). */
  readonly readOnly: boolean;
  /** Called when the user submits a reply to an agent. */
  readonly onReplySubmit: (text: string) => void;
  /** Called when the user steers a running strategy mid-run. */
  readonly onSteerSubmit: (text: string) => void;
  /** Called when the user continues a finished run with a new prompt. */
  readonly onContinueSubmit: (strategyPath: string, text: string) => void;
  /** Called when the user resolves a permission prompt. */
  readonly onPermissionDecide: (decision: PermissionDecision) => void;
  /** Called when the user submits an answer to a question. */
  readonly onQuestionSubmit: (response: string) => void;
  /** The active strategy option for this chat. */
  readonly activeStrategy: StrategyOption;
  /** All discovered strategies (offered when continuing a finished run). */
  readonly strategies: readonly StrategyOption[];
}

export function ChatPage({
  messages,
  chatStatus,
  error,
  pendingInputAgent,
  pendingPermissionRequest,
  pendingQuestionRequest,
  readOnly,
  onReplySubmit,
  onSteerSubmit,
  onContinueSubmit,
  onPermissionDecide,
  onQuestionSubmit,
  activeStrategy,
  strategies,
}: ChatPageProps): React.ReactElement {
  const debug = useDebugRender("ChatPage", {
    props: { chatStatus, messages, error },
  });
  const theme = useChatPageTheme();

  return (
    <ChatPageRender
      theme={theme}
      messages={messages}
      chatStatus={chatStatus}
      error={error}
      pendingInputAgent={pendingInputAgent}
      pendingPermissionRequest={pendingPermissionRequest}
      pendingQuestionRequest={pendingQuestionRequest}
      readOnly={readOnly}
      onReplySubmit={onReplySubmit}
      onSteerSubmit={onSteerSubmit}
      onContinueSubmit={onContinueSubmit}
      onPermissionDecide={onPermissionDecide}
      onQuestionSubmit={onQuestionSubmit}
      activeStrategy={activeStrategy}
      strategies={strategies}
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
  /** Pending question request, or null. */
  readonly pendingQuestionRequest: PendingQuestionRequest | null;
  /** Whether this run is a read-only replay (composer hidden). */
  readonly readOnly: boolean;
  /** Called when the user submits a reply to an agent. */
  readonly onReplySubmit: (text: string) => void;
  /** Called when the user steers a running strategy mid-run. */
  readonly onSteerSubmit: (text: string) => void;
  /** Called when the user continues a finished run with a new prompt. */
  readonly onContinueSubmit: (strategyPath: string, text: string) => void;
  /** Called when the user resolves a permission prompt. */
  readonly onPermissionDecide: (decision: PermissionDecision) => void;
  /** Called when the user submits an answer to a question. */
  readonly onQuestionSubmit: (response: string) => void;
  /** The active strategy option for this chat. */
  readonly activeStrategy: StrategyOption;
  /** All discovered strategies (offered when continuing a finished run). */
  readonly strategies: readonly StrategyOption[];
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
  pendingQuestionRequest,
  readOnly,
  onReplySubmit,
  onSteerSubmit,
  onContinueSubmit,
  onPermissionDecide,
  onQuestionSubmit,
  activeStrategy,
  strategies,
  debugRef,
}: ChatPageRenderProps): React.ReactElement {
  const showPermission =
    chatStatus === "waiting_permission" && pendingPermissionRequest !== null;
  const showQuestion =
    chatStatus === "waiting_question" && pendingQuestionRequest !== null;

  // The composer is always available for a live (non-read-only) run, except
  // while a permission/question prompt is taking over the bottom region.
  const isFinished =
    chatStatus === "completed" ||
    chatStatus === "error" ||
    chatStatus === "cancelled";
  const showComposer = !readOnly && !showPermission && !showQuestion;

  // Behavior depends on the run's lifecycle phase:
  //   - waiting_input → reply to the blocked agent
  //   - finished       → continue (possibly switching strategy)
  //   - running/pending → steer the live run
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

  // Only the "continue" phase lets the user switch strategies; reply and
  // steer keep the run's current strategy fixed.
  const composerStrategies =
    composerMode === "continue" ? strategies : [activeStrategy];

  // When the composer appears (or its mode changes), Ink's focus manager has
  // no reason to route focus to a freshly-mounted input — grab it explicitly
  // so the user can immediately type and submit. composerMode is intentionally
  // a dependency: `showComposer` stays true across phase transitions
  // (running → completed → waiting_input), so we rely on the mode changing to
  // re-grab focus when the composer's role (and ChatTextArea mount) changes.
  const { focus } = useFocusManager();
  // biome-ignore lint/correctness/useExhaustiveDependencies: composerMode re-triggers focus on phase change
  useEffect(() => {
    if (showComposer) focus(REPLY_INPUT_ID);
  }, [focus, showComposer, composerMode]);

  // ChatTextArea emits (strategyPath, input). Route to the right handler
  // based on the current composer mode.
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
          strategies={composerStrategies}
          onSubmit={handleComposerSubmit}
          placeholder={composerPlaceholder}
          showStrategyRow={composerMode === "continue"}
          id={REPLY_INPUT_ID}
        />
      ) : null}

      <StatusBar
        status={chatStatus}
        error={error}
        strategyName={activeStrategy.label}
      />
    </Box>
  );
}
