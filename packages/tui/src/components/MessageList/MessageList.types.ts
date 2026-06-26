import type { ChatMessage } from "../../hooks/useChat/useChat.types";

export interface GroupedChatMessage extends ChatMessage {
  /** Messages spawned by a `launch_strategy` tool call inside this message. */
  readonly subMessages: readonly GroupedChatMessage[];
}
