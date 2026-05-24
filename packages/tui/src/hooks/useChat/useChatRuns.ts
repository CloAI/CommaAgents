import { useContext } from "react";

import { ChatRunsContext } from "./useChat.context";
import type { ChatRunsContextType } from "./useChat.types";

/**
 * Access the full chat runs context — all runs, the active id, and
 * management methods (create/start/remove/setActive).
 *
 * Use this when a component needs awareness of multiple runs at once
 * (e.g. a run switcher). For single-run views, prefer `useChat()`.
 *
 * Must be called inside a `<ChatRunsContextProvider>`.
 */
export function useChatRuns(): ChatRunsContextType {
  const contextValue = useContext(ChatRunsContext);
  if (!contextValue) {
    throw new Error(
      "useChatRuns must be used within a <ChatRunsContextProvider>",
    );
  }
  return contextValue;
}
