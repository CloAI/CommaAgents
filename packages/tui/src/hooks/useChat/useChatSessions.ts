import { useContext } from "react";

import { ChatSessionsContext } from "./useChat.context";
import type { ChatSessionsContextType } from "./useChat.types";

/**
 * Access the full chat sessions context — all sessions, the active id, and
 * management methods (create/start/remove/setActive).
 *
 * Use this when a component needs awareness of multiple sessions at once
 * (e.g. a session switcher). For single-session views, prefer `useChat()`.
 *
 * Must be called inside a `<ChatSessionsContextProvider>`.
 */
export function useChatSessions(): ChatSessionsContextType {
  const contextValue = useContext(ChatSessionsContext);
  if (!contextValue) {
    throw new Error("useChatSessions must be used within a <ChatSessionsContextProvider>");
  }
  return contextValue;
}
