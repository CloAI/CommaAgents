import { Box, Text } from "ink";
import type React from "react";
import { useMemo } from "react";

import type { ChatMessage } from "../../hooks/useChat/useChat.types";
import { useDebugRender } from "../../hooks/useDebugRender";
import { ScrollableView } from "../ScrollableView";
import { AgentMessage } from "./AgentMessage";
import { useMessageListTheme } from "./MessageList.theme";
import type {
  GroupedChatMessage,
  MessageListProps,
  MessageListRenderProps,
} from "./MessageList.types";
import { UserMessage } from "./UserMessage";

/**
 * Scrollable, role-dispatching message list.
 *
 * Wraps `ScrollableView` so the user can scroll back through history with
 * the mouse wheel. The list auto-pins to the latest message until the user
 * scrolls up; once they scroll back down to the bottom, auto-pin re-engages
 * — standard chat behavior. There is no concept of a "selected" message,
 * so keyboard arrow-key navigation is intentionally absent.
 */
export function MessageList({
  messages,
  onOpenSubStrategy,
}: MessageListProps): React.ReactElement {
  const debug = useDebugRender("MessageList", {
    props: { messages },
  });
  const theme = useMessageListTheme();
  const groupedMessages = useMemo(
    () => groupSubStrategyMessages(messages),
    [messages],
  );

  return (
    <MessageListRender
      messages={groupedMessages}
      debugRef={debug.ref}
      containerProps={theme.container}
      emptyStateProps={theme.emptyState}
      emptyStateTextProps={theme.emptyState.text}
      onOpenSubStrategy={onOpenSubStrategy}
    />
  );
}

export function MessageListRender({
  messages,
  debugRef,
  containerProps,
  emptyStateProps,
  emptyStateTextProps,
  onOpenSubStrategy,
}: MessageListRenderProps): React.ReactElement {
  if (messages.length === 0) {
    return (
      <Box {...emptyStateProps}>
        <Text {...emptyStateTextProps}>No messages yet.</Text>
      </Box>
    );
  }

  return (
    <Box ref={debugRef} {...containerProps}>
      <ScrollableView<GroupedChatMessage>
        items={messages}
        getKey={(message) => message.id}
        renderItem={(message) => (
          <MessageRow
            message={message}
            {...(onOpenSubStrategy ? { onOpenSubStrategy } : {})}
          />
        )}
        stickToBottom
      />
    </Box>
  );
}

interface MessageRowProps {
  readonly message: GroupedChatMessage;
  readonly onOpenSubStrategy?: (toolCallId: string) => void;
}

/** Routes a single ChatMessage to the role-specific renderer. */
function MessageRow({
  message,
  onOpenSubStrategy,
}: MessageRowProps): React.ReactElement | null {
  if (message.role === "user") {
    return <UserMessage text={message.text} label={message.sender} />;
  }
  if (message.role === "agent") {
    return (
      <AgentMessage
        sender={message.sender}
        segments={message.segments}
        fallbackText={message.text}
        streaming={message.streaming}
        model={message.model}
        contextWindow={message.contextWindow}
        contextUsage={message.contextUsage}
        startedAt={message.timestamp}
        completedAt={message.completedAt}
        subMessages={message.subMessages}
        onOpenSubStrategy={onOpenSubStrategy}
      />
    );
  }
  return null;
}

interface MutableGroupedChatMessage extends ChatMessage {
  subMessages: GroupedChatMessage[];
}

/** Build a nested message tree from `parentToolCallId` lineage metadata. */
export function groupSubStrategyMessages(
  messages: readonly ChatMessage[],
): readonly GroupedChatMessage[] {
  const groupedByMessageId = new Map<string, MutableGroupedChatMessage>();
  const launchToolCallToMessageId = new Map<string, string>();

  for (const message of messages) {
    const groupedMessage: MutableGroupedChatMessage = {
      ...message,
      subMessages: [],
    };
    groupedByMessageId.set(message.id, groupedMessage);

    for (const segment of message.segments ?? []) {
      if (
        segment.type === "tool-call" &&
        segment.toolName === "launch_strategy"
      ) {
        launchToolCallToMessageId.set(segment.toolCallId, message.id);
      }
    }
  }

  const rootMessages: MutableGroupedChatMessage[] = [];
  for (const message of messages) {
    const groupedMessage = groupedByMessageId.get(message.id);
    if (!groupedMessage) continue;

    const parentMessageId = message.parentToolCallId
      ? launchToolCallToMessageId.get(message.parentToolCallId)
      : undefined;
    const parentMessage = parentMessageId
      ? groupedByMessageId.get(parentMessageId)
      : undefined;

    if (parentMessage && parentMessage.id !== message.id) {
      parentMessage.subMessages.push(groupedMessage);
    } else {
      rootMessages.push(groupedMessage);
    }
  }

  return rootMessages;
}

/** Return only messages emitted by a launch call and its nested launches. */
export function selectSubStrategyMessages(
  messages: readonly ChatMessage[],
  toolCallId: string,
): readonly ChatMessage[] {
  const includedToolCallIds = new Set([toolCallId]);
  const selected: ChatMessage[] = [];

  for (const message of messages) {
    if (
      !message.parentToolCallId ||
      !includedToolCallIds.has(message.parentToolCallId)
    ) {
      continue;
    }

    selected.push(message);
    for (const segment of message.segments ?? []) {
      if (
        segment.type === "tool-call" &&
        segment.toolName === "launch_strategy"
      ) {
        includedToolCallIds.add(segment.toolCallId);
      }
    }
  }

  return selected;
}

/** Resolve the strategy name advertised by a launch tool call. */
export function findSubStrategyName(
  messages: readonly ChatMessage[],
  toolCallId: string,
): string {
  for (const message of messages) {
    for (const segment of message.segments ?? []) {
      if (
        segment.type !== "tool-call" ||
        segment.toolName !== "launch_strategy" ||
        segment.toolCallId !== toolCallId
      ) {
        continue;
      }

      try {
        const args = JSON.parse(segment.args) as unknown;
        if (typeof args === "object" && args !== null) {
          const name = (args as Record<string, unknown>).name;
          if (typeof name === "string" && name.length > 0) return name;
        }
      } catch {
        return "strategy";
      }
    }
  }

  return "strategy";
}
