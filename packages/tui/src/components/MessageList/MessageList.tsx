import { Box, Text } from "ink";
import type React from "react";

import type { ChatMessage } from "../../hooks/useChat/useChat.types";
import { useDebugRender } from "../../hooks/useDebugRender";
import { ScrollableView } from "../ScrollableView";
import { AgentMessage } from "./AgentMessage";
import { useMessageListTheme } from "./MessageList.theme";
import { estimateMessageRowHeight } from "./MessageList.utils";
import { UserMessage } from "./UserMessage";

export interface MessageListProps {
  /** Messages to render in chronological order. */
  readonly messages: readonly ChatMessage[];
}

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
}: MessageListProps): React.ReactElement {
  const debug = useDebugRender("MessageList", {
    props: { messages },
  });
  const theme = useMessageListTheme();

  if (messages.length === 0) {
    return (
      <Box {...theme.emptyState}>
        <Text {...theme.emptyState.text}>No messages yet.</Text>
      </Box>
    );
  }

  return (
    <Box ref={debug.ref} {...theme.container}>
      <ScrollableView<ChatMessage>
        items={messages}
        getKey={(message) => message.id}
        getRowHeight={(message, _index, viewportWidth) =>
          estimateMessageRowHeight(message, viewportWidth)
        }
        renderItem={(message) => <MessageRow message={message} />}
        stickToBottom
      />
    </Box>
  );
}

interface MessageRowProps {
  readonly message: ChatMessage;
}

/** Routes a single ChatMessage to the role-specific renderer. */
function MessageRow({ message }: MessageRowProps): React.ReactElement | null {
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
      />
    );
  }
  // if (message.role === "system") {
  //   return <SystemMessage text={message.text} />;
  // }
  return null;
}
