import type { ChatMessage } from "../../hooks/useChat/useChat.types";

/** Create a ChatMessage with sensible defaults, overriding specific fields. */
export function createChatMessage(overrides: Partial<ChatMessage> & { readonly id: string }): ChatMessage {
  return {
    role: "user",
    sender: "you",
    text: "Hello",
    streaming: false,
    timestamp: Date.now(),
    ...overrides,
  };
}
