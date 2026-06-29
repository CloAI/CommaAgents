import { Box, Text, useInput } from "ink";
import type React from "react";
import { useCallback, useMemo } from "react";
import { useNavigate, useParams } from "react-router";

import {
  findSubStrategyName,
  MessageList,
  selectSubStrategyMessages,
} from "../../components/MessageList";
import type { ChatMessage } from "../../hooks/useChat";
import { useChatState } from "../../hooks/useChat";
import type { ChatPageTheme } from "../ChatPage";
import { useChatPageTheme } from "../ChatPage";

/** Read-only, live transcript for one spawned strategy invocation. */
export function SpawnedStrategyPage(): React.ReactElement {
  const { chatRunId = "", toolCallId = "" } = useParams<{
    chatRunId: string;
    toolCallId: string;
  }>();
  const navigate = useNavigate();
  const chatState = useChatState(chatRunId);
  const theme = useChatPageTheme();

  const messages = useMemo(
    () => selectSubStrategyMessages(chatState.messages, toolCallId),
    [chatState.messages, toolCallId],
  );
  const strategyName = useMemo(
    () => findSubStrategyName(chatState.messages, toolCallId),
    [chatState.messages, toolCallId],
  );

  const handleBack = useCallback((): void => {
    navigate(`/chat/${encodeURIComponent(chatRunId)}`);
  }, [chatRunId, navigate]);
  const handleOpenSubStrategy = useCallback(
    (nestedToolCallId: string): void => {
      navigate(
        `/chat/${encodeURIComponent(chatRunId)}/spawned/${encodeURIComponent(nestedToolCallId)}`,
      );
    },
    [chatRunId, navigate],
  );

  useInput((_input, key) => {
    if (key.escape) handleBack();
  });

  return (
    <SpawnedStrategyPageRender
      theme={theme}
      strategyName={strategyName}
      messages={messages}
      onOpenSubStrategy={handleOpenSubStrategy}
    />
  );
}

export interface SpawnedStrategyPageRenderProps {
  readonly theme: ChatPageTheme;
  readonly strategyName: string;
  readonly messages: readonly ChatMessage[];
  readonly onOpenSubStrategy?: (toolCallId: string) => void;
}

export function SpawnedStrategyPageRender({
  theme,
  strategyName,
  messages,
  onOpenSubStrategy,
}: SpawnedStrategyPageRenderProps): React.ReactElement {
  return (
    <Box {...theme.root}>
      <Box {...theme.header}>
        <Text {...theme.header.title}>spawned {strategyName}</Text>
        <Text {...theme.footer.text}> Esc back</Text>
      </Box>
      <Box {...theme.messageArea}>
        <MessageList
          messages={messages}
          {...(onOpenSubStrategy ? { onOpenSubStrategy } : {})}
        />
      </Box>
    </Box>
  );
}
