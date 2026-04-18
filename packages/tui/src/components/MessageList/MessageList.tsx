import { Box, Text } from "ink";

import type { ChatMessage } from "../../hooks/useChat/useChat.types";
import { useDebugRender } from "../../hooks/useDebugRender";
import { useMessageListTheme } from "./MessageList.theme";

interface MessageListProps {
  readonly messages: readonly ChatMessage[];
  /** Max visible messages (scrolls to bottom). */
  readonly maxVisible?: number;
}

/**
 * Renders a scrollable list of chat messages.
 * Each message shows the sender name and text, colored by role.
 */
export function MessageList({ messages, maxVisible = 20 }: MessageListProps) {
  const debug = useDebugRender("MessageList", { props: { messages, maxVisible } });
  const theme = useMessageListTheme();
  const visible = messages.slice(-maxVisible);

  if (visible.length === 0) {
    return (
      <Box {...theme.emptyState}>
        <Text {...theme.emptyState.text}>No messages yet.</Text>
      </Box>
    );
  }

  return (
    <Box ref={debug.ref} {...theme.container}>
      {visible.map((message) => (
        <Box key={message.id} {...theme.messageRow}>
          <Text {...theme.roles[message.role]}>{message.sender}</Text>
          <Text {...theme.messageSeparator}>: </Text>
          <Text {...theme.messageBody}>
            {message.text}
            {message.streaming ? <Text {...theme.streamingCursor}>{"\u258D"}</Text> : null}
          </Text>
        </Box>
      ))}
    </Box>
  );
}
